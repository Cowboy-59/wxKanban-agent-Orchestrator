// [SCOPE 058 / T010] BEGIN — Cockpit scope check-out / check-in commands.
// Check out: claim the scope via MCP, then create+switch the git branch locally
// via wxAIGit (the only sanctioned git path). Conflicts notify with a "Check out
// anyway" override (force). Check in: release the claim, then offer to merge the
// branch back. All git runs only on the explicit user action (FR-005, git rule).
import * as vscode from 'vscode';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProjectContext } from '../services/projectContext.js';
import { resolveToken } from '../services/auth.js';
import { CockpitMcpClient } from '../services/mcpClient.js';
import type { CockpitNode } from '../providers/cockpitTreeProvider.js';
import type { CheckoutScopeResult, CheckinScopeResult } from '../types.js';

interface Ctx {
  projectId: string;
  projectRoot: string;
  client: CockpitMcpClient;
}

async function resolveCtx(secrets: vscode.SecretStorage): Promise<Ctx | null> {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const ctx = resolveProjectContext(folders);
  if (!ctx) {
    void vscode.window.showWarningMessage('wxKanban: open a linked project folder first.');
    return null;
  }
  let token: string | null = null;
  try {
    token = await resolveToken(secrets, ctx.projectRoot, ctx.projectId);
  } catch {
    token = null;
  }
  if (!token) {
    void vscode.window.showWarningMessage('wxKanban: sign in (no API token found) before checking out a scope.');
    return null;
  }
  return { projectId: ctx.projectId, projectRoot: ctx.projectRoot, client: new CockpitMcpClient({ baseUrl: ctx.mcpBaseUrl, token }) };
}

// [SCOPE 058 / T011] Run a wxAIGit subcommand in the project root. wxAIGit is the
// ONLY sanctioned git path (a checkout/check-in click is the explicit user action
// it requires). If the wrapper isn't installed, degrade to showing + copying the
// exact command rather than failing silently or shelling raw git.
// [SCOPE 058 / T025] Resolve the project-local wxAIGit launcher by absolute path
// so it works regardless of PATH. On Windows cmd would find wxAIGit.cmd in cwd,
// but a POSIX shell searches PATH only — so we point at the kit-installed
// launcher in the project root when present, falling back to a bare `wxAIGit`
// (PATH) which then surfaces as "missing" if absent.
function wxAIGitCommand(cwd: string): string {
  const local = process.platform === 'win32' ? join(cwd, 'wxAIGit.cmd') : join(cwd, 'wxAIGit');
  return existsSync(local) ? `"${local}"` : 'wxAIGit';
}

function runWxAIGit(args: string, cwd: string): Promise<{ ok: boolean; missing: boolean; output: string }> {
  const command = `${wxAIGitCommand(cwd)} ${args}`;
  return new Promise((resolve) => {
    exec(command, { cwd, windowsHide: true }, (err, stdout, stderr) => {
      const output = `${stdout ?? ''}${stderr ?? ''}`.trim();
      if (!err) return resolve({ ok: true, missing: false, output });
      const code = (err as NodeJS.ErrnoException).code;
      const missing = code === 'ENOENT' || /not (found|recognized)|command not found/i.test(output);
      resolve({ ok: false, missing, output: output || String(err) });
    });
  });
}

async function runOrFallback(args: string, cwd: string): Promise<void> {
  const res = await runWxAIGit(args, cwd);
  if (res.ok) {
    void vscode.window.showInformationMessage(`wxKanban: wxAIGit ${args.split(' ')[0]} done.`);
    return;
  }
  if (res.missing) {
    const choice = await vscode.window.showWarningMessage(
      `wxKanban: wxAIGit isn't available here. Run this yourself:\n\n  wxAIGit ${args}`,
      'Copy command',
    );
    if (choice === 'Copy command') await vscode.env.clipboard.writeText(`wxAIGit ${args}`);
    return;
  }
  void vscode.window.showErrorMessage(`wxKanban: wxAIGit ${args.split(' ')[0]} failed — ${res.output.slice(0, 300)}`);
}

// [SCOPE 058 / T010 + T012] Check out the scope on a node, with conflict override.
export async function checkoutScope(secrets: vscode.SecretStorage, node: CockpitNode | undefined, refresh: () => void): Promise<void> {
  const specNumber = node?.scope?.specNumber;
  if (!specNumber) {
    void vscode.window.showInformationMessage('wxKanban: select a scope to check out.');
    return;
  }
  const ctx = await resolveCtx(secrets);
  if (!ctx) return;

  let result: CheckoutScopeResult;
  try {
    result = await ctx.client.checkoutScope(ctx.projectId, specNumber);
  } catch (err) {
    void vscode.window.showErrorMessage(`wxKanban: check-out failed — ${(err as Error).message}`);
    return;
  }

  // [SCOPE 058 / T012] Collision — notify with the holder and require an explicit override.
  if (!result.ok && result.status === 'conflict') {
    const holder = result.heldBy?.name ?? 'another developer';
    const when = result.claimedAt ? ` (since ${new Date(result.claimedAt).toLocaleString()})` : '';
    const choice = await vscode.window.showWarningMessage(
      `Scope #${specNumber} is checked out by ${holder}${when}. You may be duplicating effort.`,
      { modal: true },
      'Check out anyway',
    );
    if (choice !== 'Check out anyway') return;
    try {
      result = await ctx.client.checkoutScope(ctx.projectId, specNumber, true);
    } catch (err) {
      void vscode.window.showErrorMessage(`wxKanban: forced check-out failed — ${(err as Error).message}`);
      return;
    }
  }

  if (!result.ok) {
    // forbidden (consultant not granted) / not_found / other
    void vscode.window.showWarningMessage(`wxKanban: ${result.message ?? `cannot check out scope #${specNumber}.`}`);
    return;
  }

  if (result.status === 'single_user') {
    void vscode.window.showInformationMessage(`wxKanban: single-member project — no claim needed; creating branch for scope #${specNumber}.`);
  }

  // Create + switch to the branch locally (FR-005). branchName is returned by the tool.
  if (result.branchName) {
    await runOrFallback(`branch --create ${result.branchName}`, ctx.projectRoot);
  }
  refresh();
}

// [SCOPE 058 / T010] Check in the scope on a node, then offer to merge the branch back.
export async function checkinScope(secrets: vscode.SecretStorage, node: CockpitNode | undefined, refresh: () => void): Promise<void> {
  const specNumber = node?.scope?.specNumber;
  if (!specNumber) {
    void vscode.window.showInformationMessage('wxKanban: select a scope to check in.');
    return;
  }
  const ctx = await resolveCtx(secrets);
  if (!ctx) return;

  let result: CheckinScopeResult;
  try {
    result = await ctx.client.checkinScope(ctx.projectId, specNumber);
  } catch (err) {
    void vscode.window.showErrorMessage(`wxKanban: check-in failed — ${(err as Error).message}`);
    return;
  }

  if (!result.ok) {
    void vscode.window.showWarningMessage(`wxKanban: ${result.message ?? `cannot check in scope #${specNumber}.`}`);
    return;
  }
  refresh();

  if (result.status === 'released') {
    const choice = await vscode.window.showInformationMessage(
      `Scope #${specNumber} checked in. Merge the branch back into the integration branch?`,
      'Merge now',
      'Not now',
    );
    if (choice === 'Merge now') await runOrFallback('merge', ctx.projectRoot);
  } else if (result.status === 'single_user' || result.status === 'noop') {
    void vscode.window.showInformationMessage(`wxKanban: nothing to release for scope #${specNumber}.`);
  }
}
// [SCOPE 058 / T010] END
