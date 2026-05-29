import * as vscode from 'vscode';
import { resolveProjectContext } from '../services/projectContext.js';
import { resolveToken } from '../services/auth.js';
import { CockpitMcpClient } from '../services/mcpClient.js';
import type { CockpitScope, CockpitSummary, CockpitTask } from '../types.js';

type NodeKind = 'scope' | 'task' | 'message';
type LoadState = 'unloaded' | 'ok' | 'empty' | 'no-project' | 'no-token' | 'error';

interface ComputedState {
  state: Exclude<LoadState, 'unloaded'>;
  summary: CockpitSummary | null;
  activeScope: string | undefined;
  errorMsg: string;
  signature: string;
}

// [SCOPE 042 / T016] BEGIN — CockpitNode (one item type for scopes, tasks, and state messages)
export class CockpitNode extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly scope?: CockpitScope,
    public readonly task?: CockpitTask,
  ) {
    super(label, collapsibleState);
  }
}
// [SCOPE 042 / T016] END

// [SCOPE 042 / T016] BEGIN — CockpitTreeProvider (active scope pinned -> scopes -> incomplete tasks)
export class CockpitTreeProvider implements vscode.TreeDataProvider<CockpitNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CockpitNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private summary: CockpitSummary | null = null;
  private activeScope: string | undefined;
  private state: LoadState = 'unloaded';
  private errorMsg = '';
  private signature = '';

  constructor(private readonly secrets: vscode.SecretStorage) {}

  // Hard refresh: drop cached data and show the load path again. Used by the
  // manual command, the sign-in flow, and the kit's emitted refresh URI.
  refresh(): void {
    this.summary = null;
    this.state = 'unloaded';
    this.signature = '';
    this._onDidChangeTreeData.fire();
  }

  // [SCOPE 042 / T020] BEGIN — poll (fallback re-query; fires only on real change)
  // The emitted-command URI (T021) is the primary, immediate signal. This poll
  // is the FR-006 fallback for work changed outside this IDE. It re-queries in
  // the background and only repaints when the content signature changed, so a
  // visible-but-unchanged view never flickers.
  async poll(): Promise<void> {
    const next = await this.computeState();
    if (next.signature === this.signature && next.state === this.state) return;
    this.applyState(next);
    this._onDidChangeTreeData.fire();
  }
  // [SCOPE 042 / T020] END

  getTreeItem(element: CockpitNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CockpitNode): Promise<CockpitNode[]> {
    if (element) {
      return element.kind === 'scope' && element.scope
        ? element.scope.tasks.map((t) => taskNode(t, element.scope!))
        : [];
    }
    if (this.state === 'unloaded') {
      this.applyState(await this.computeState());
    }
    return this.rootNodes();
  }

  private applyState(s: ComputedState): void {
    this.state = s.state;
    this.summary = s.summary;
    this.activeScope = s.activeScope;
    this.errorMsg = s.errorMsg;
    this.signature = s.signature;
  }

  // Resolve project + token + MCP read into a self-contained state snapshot.
  // Pure of side effects on `this` so both the load path and poll can use it.
  private async computeState(): Promise<ComputedState> {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const ctx = resolveProjectContext(folders);
    if (!ctx) {
      return { state: 'no-project', summary: null, activeScope: undefined, errorMsg: '', signature: 'no-project' };
    }

    let token: string | null = null;
    try {
      token = await resolveToken(this.secrets, ctx.projectRoot, ctx.projectId);
    } catch {
      token = null;
    }
    if (!token) {
      return { state: 'no-token', summary: null, activeScope: ctx.activeScope, errorMsg: '', signature: 'no-token' };
    }

    try {
      const client = new CockpitMcpClient({ baseUrl: ctx.mcpBaseUrl, token });
      const summary = await client.cockpitSummary(ctx.projectId);
      const withWork = summary.scopes.filter((s) => s.remainingCount > 0);
      return {
        state: withWork.length === 0 ? 'empty' : 'ok',
        summary,
        activeScope: ctx.activeScope,
        errorMsg: '',
        signature: `${ctx.activeScope ?? ''}|${signatureOf(summary)}`,
      };
    } catch (err) {
      // Surface the resolved endpoint so a misconfig (e.g. falling back to
      // localhost when the hosted URL key is missing) is self-diagnosing.
      const msg = `Tried ${ctx.mcpBaseUrl} — ${(err as Error).message}`;
      return { state: 'error', summary: null, activeScope: ctx.activeScope, errorMsg: msg, signature: `error:${msg}` };
    }
  }

  private rootNodes(): CockpitNode[] {
    switch (this.state) {
      case 'no-project':
        return [messageNode('No wxKanban project linked', 'link', 'Open a folder with a .wxkanban-project.json, then refresh.', 'wxkanban.cockpit.signIn')];
      case 'no-token':
        return [messageNode('Sign in to wxKanban', 'key', 'No API token found — click to enter one.', 'wxkanban.cockpit.signIn')];
      case 'error':
        return [messageNode('Cannot reach wxKanban — click to retry', 'error', this.errorMsg, 'wxkanban.cockpit.refresh')];
      case 'empty':
        return [messageNode('All caught up — no remaining work', 'check', 'No incomplete tasks in this project.')];
      case 'ok': {
        const withWork = (this.summary?.scopes ?? []).filter((s) => s.remainingCount > 0);
        const sorted = [...withWork].sort((a, b) => {
          const aActive = a.specNumber === this.activeScope ? 0 : 1;
          const bActive = b.specNumber === this.activeScope ? 0 : 1;
          return aActive - bActive || a.specNumber.localeCompare(b.specNumber);
        });
        return sorted.map((s) => scopeNode(s, s.specNumber === this.activeScope));
      }
      default:
        return [];
    }
  }
}
// [SCOPE 042 / T016] END

// [SCOPE 042 / T016] BEGIN — node factories
function scopeNode(scope: CockpitScope, isActive: boolean): CockpitNode {
  const node = new CockpitNode('scope', `#${scope.specNumber}  ${scope.title}`, vscode.TreeItemCollapsibleState.Collapsed, scope);
  node.description = `${scope.remainingCount} left`;
  node.tooltip = `Scope ${scope.specNumber} — ${scope.title}\nstatus: ${scope.status}${isActive ? '\n(active scope)' : ''}`;
  node.iconPath = new vscode.ThemeIcon(isActive ? 'star-full' : 'layers');
  node.contextValue = 'wxkanban.scope';
  return node;
}

function taskNode(task: CockpitTask, scope: CockpitScope): CockpitNode {
  const node = new CockpitNode('task', task.title, vscode.TreeItemCollapsibleState.None, scope, task);
  node.description = task.status;
  node.iconPath = statusIcon(task.status);
  node.contextValue = 'wxkanban.task';
  node.command = {
    command: 'wxkanban.cockpit.openDetail',
    title: 'Open Detail',
    arguments: [{ task, scope }],
  };
  return node;
}

function messageNode(label: string, icon: string, tooltip?: string, command?: string): CockpitNode {
  const node = new CockpitNode('message', label, vscode.TreeItemCollapsibleState.None);
  node.iconPath = new vscode.ThemeIcon(icon);
  if (tooltip) node.tooltip = tooltip;
  if (command) node.command = { command, title: label };
  return node;
}

function statusIcon(status: string): vscode.ThemeIcon {
  switch (status) {
    case 'in_progress':
      return new vscode.ThemeIcon('sync');
    case 'blocked':
      return new vscode.ThemeIcon('error');
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}
// [SCOPE 042 / T016] END

// [SCOPE 042 / T020] BEGIN — signatureOf (stable fingerprint of the remaining-work payload)
// Captures everything the view renders — scope identity, remaining counts, and
// each task's id+status — so poll() can tell a real change from a no-op without
// repainting the tree on every tick.
function signatureOf(summary: CockpitSummary): string {
  return summary.scopes
    .map((s) => `${s.specNumber}:${s.remainingCount}:${s.tasks.map((t) => `${t.id}=${t.status}`).join(',')}`)
    .join('|');
}
// [SCOPE 042 / T020] END
