// SCOPE-154 / T014 (FR-014) — Cockpit live view of the running scope and process.
//
// A read-only "Autopilot" tree, sourced only from the local run-state file
// (docs/GOD-State-Autopilot.json — autopilot-skip.ts's AUTOPILOT_STATE_PATH, the same
// docs/GOD-State*.json shape/location convention FR-002/FR-003 already use). No new database
// table, no new server route, no second run-state file: this provider reads it with a
// FileSystemWatcher exactly the way impactViews.ts's ImpactController watches `.wxai/impact.json`
// — no polling of its own. "Not running" is shown rather than the view going empty when the file
// is missing or unparseable, per FR-014's acceptance criteria.
import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import * as path from 'path';
import {
  formatElapsed,
  statusLabel,
  toAutopilotView,
  type AutopilotListItem,
  type AutopilotRunStateFile,
  type AutopilotView,
} from '../services/autopilotRunState.js';
import { resolveProjectContext } from '../services/projectContext.js';

/** The real path autopilot-skip.ts (SCOPE-154 / T004) writes today; kept local (not imported from
 *  wxkanban-agent, a separate package) since only the path string is needed. */
export const AUTOPILOT_STATE_RELATIVE_PATH = 'docs/GOD-State-Autopilot.json';

type NodeKind = 'status' | 'item';

// [SCOPE 154 / T014] BEGIN — AutopilotNode (one item type for the status line and list rows)
export class AutopilotNode extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly listItem?: AutopilotListItem,
  ) {
    super(label, collapsibleState);
  }
}
// [SCOPE 154 / T014] END

// [SCOPE 154 / T014] BEGIN — AutopilotTreeProvider (file-watch only, no polling)
export class AutopilotTreeProvider implements vscode.TreeDataProvider<AutopilotNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<AutopilotNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private view: AutopilotView;
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly statePath: string;

  constructor(private readonly root: string) {
    this.statePath = path.join(root, AUTOPILOT_STATE_RELATIVE_PATH);
    this.view = toAutopilotView(this.readState());

    // Same pattern as ImpactController: follow the file, never poll for it.
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, AUTOPILOT_STATE_RELATIVE_PATH),
    );
    this.watcher.onDidChange(() => this.reload());
    this.watcher.onDidCreate(() => this.reload());
    this.watcher.onDidDelete(() => this.reload());
  }

  dispose(): void {
    this.watcher.dispose();
  }

  /** Manual re-read, for the refresh command; the watcher already calls this on every file change. */
  refresh(): void {
    this.reload();
  }

  private reload(): void {
    this.view = toAutopilotView(this.readState());
    this._onDidChangeTreeData.fire();
  }

  private readState(): AutopilotRunStateFile | null {
    try {
      return JSON.parse(readFileSync(this.statePath, 'utf8')) as AutopilotRunStateFile;
    } catch {
      return null; // missing or unparseable: "not running" (FR-014)
    }
  }

  getTreeItem(element: AutopilotNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AutopilotNode): AutopilotNode[] {
    if (element) return []; // flat list under the status line; nothing nests further
    return [statusNode(this.view), ...this.view.items.map(itemNode)];
  }
}
// [SCOPE 154 / T014] END

// [SCOPE 154 / T014] BEGIN — row builders (FR-014)
function statusNode(view: AutopilotView): AutopilotNode {
  if (!view.running) {
    const node = new AutopilotNode('status', 'Autopilot — not running', vscode.TreeItemCollapsibleState.None);
    node.iconPath = new vscode.ThemeIcon('circle-slash');
    node.tooltip = 'No active Autopilot run was found for this project on this machine.';
    return node;
  }
  const scope = view.currentScope ? `SCOPE-${view.currentScope}` : 'unknown scope';
  const step = view.currentStep ?? 'unknown step';
  const elapsed = view.elapsedMs !== null ? formatElapsed(view.elapsedMs) : 'unknown';
  const node = new AutopilotNode(
    'status',
    `Autopilot — ${scope} · ${step} · ${elapsed}`,
    vscode.TreeItemCollapsibleState.None,
  );
  node.iconPath = new vscode.ThemeIcon('sync~spin');
  node.tooltip = `Current scope: ${scope}\nCurrent step: ${step}\nElapsed on this step: ${elapsed}`;
  node.contextValue = 'wxkanban.autopilotStatus';
  return node;
}

function itemNode(item: AutopilotListItem): AutopilotNode {
  const node = new AutopilotNode(
    'item',
    `SCOPE-${item.scope} — ${item.title}`,
    vscode.TreeItemCollapsibleState.None,
    item,
  );
  node.description = statusLabel(item.status);
  node.iconPath = new vscode.ThemeIcon(iconFor(item.status));
  return node;
}

function iconFor(status: AutopilotListItem['status']): string {
  switch (status) {
    case 'done':
      return 'pass-filled';
    case 'failed':
      return 'error';
    case 'parked':
      return 'debug-pause';
    case 'skipped':
      return 'circle-slash';
    case 'in-progress':
      return 'sync~spin';
    default:
      return 'circle-large-outline';
  }
}
// [SCOPE 154 / T014] END

// [SCOPE 154 / T014] BEGIN — registerAutopilotView (wires the tree + refresh command, mirrors registerChangeImpact)
export function registerAutopilotView(context: vscode.ExtensionContext): void {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const ctx = resolveProjectContext(folders);
  if (!ctx) return;
  const provider = new AutopilotTreeProvider(ctx.projectRoot);
  context.subscriptions.push(
    provider,
    vscode.window.createTreeView('wxkanban.autopilot', { treeDataProvider: provider }),
    vscode.commands.registerCommand('wxkanban.autopilot.refresh', () => provider.refresh()),
  );
}
// [SCOPE 154 / T014] END
