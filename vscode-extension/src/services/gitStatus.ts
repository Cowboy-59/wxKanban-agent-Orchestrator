// [SCOPE 091 / T001] Surface local commits that haven't been pushed. App Runner
// builds/deploys the app (and MCP) only on a push to main, so committed-but-
// unpushed work is invisible in production and nothing in the IDE signals a
// pending push. This mirrors kitUpdate.ts / commandsInstall.ts: a cheap, local,
// read-only check the Cockpit renders as its own collapsible group. Best-effort
// and silent when the folder is not a git repo, git is unavailable, or the
// branch has no upstream. Returns the true ahead-count; the provider caps the
// listed subjects.
import * as vscode from 'vscode';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface GitStatus {
  /** workspace root the check ran in (null when none is open). */
  root: string | null;
  /** number of commits on HEAD ahead of its upstream (0 when none / unknown). */
  aheadCount: number;
  /** subject lines of the unpushed commits, newest first (uncapped). */
  subjects: string[];
}

/** First workspace folder that looks like a wxKanban kit install. */
function findRoot(): string | null {
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    if (fs.existsSync(path.join(f.uri.fsPath, '.wxkanban-project.json'))) return f.uri.fsPath;
  }
  return null;
}

/** Run a git command in `cwd` with a short timeout; '' on any failure. */
function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // Not a repo, no upstream (@{u} errors), git missing, or a hung call that
    // hit the timeout — all degrade to "no result", never an exception.
    return '';
  }
}

/**
 * Read-only: how many commits is the current branch ahead of its upstream, and
 * what are their subjects. Best-effort — a non-git / no-upstream / git-missing
 * workspace yields `{ aheadCount: 0, subjects: [] }` and never throws.
 */
export function checkGitStatus(): GitStatus {
  const root = findRoot();
  const status: GitStatus = { root, aheadCount: 0, subjects: [] };
  if (!root) return status;

  const count = git(root, ['rev-list', '--count', '@{u}..HEAD']);
  const n = Number.parseInt(count, 10);
  if (!Number.isFinite(n) || n <= 0) return status; // 0 ahead, no upstream, or unreadable

  status.aheadCount = n;
  const log = git(root, ['log', '--format=%s', '@{u}..HEAD']);
  status.subjects = log ? log.split(/\r?\n/).filter((l) => l.length > 0) : [];
  return status;
}
