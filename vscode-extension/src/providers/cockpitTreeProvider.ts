import * as vscode from 'vscode';
import { resolveProjectContext } from '../services/projectContext.js';
import { resolveToken } from '../services/auth.js';
import { CockpitMcpClient } from '../services/mcpClient.js';
import { loadCommandCatalog, type HelpCatalog, type HelpCommand, type HelpParam } from '../services/helpCatalog.js';
import { loadVideoCatalog, type DocVideo } from '../services/videosCatalog.js'; // [SCOPE 042 / Videos]
import type { CockpitScope, CockpitSummary, CockpitTask, MyFeedbackItem } from '../types.js';

type NodeKind =
  | 'scope'
  | 'task'
  | 'message'
  | 'feedback-group'
  | 'feedback'
  | 'help-group'
  | 'help-category'
  | 'help-item'
  | 'help-param'
  | 'videos-group' // [SCOPE 042 / Videos]
  | 'video-item'; // [SCOPE 042 / Videos]
type LoadState = 'unloaded' | 'ok' | 'empty' | 'no-project' | 'no-token' | 'error';

interface ComputedState {
  state: Exclude<LoadState, 'unloaded'>;
  summary: CockpitSummary | null;
  activeScope: string | undefined;
  // [SCOPE 043 / T010] the submitter's own feedback (best-effort; null when unfetched)
  feedback: MyFeedbackItem[];
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
    public readonly feedbackItem?: MyFeedbackItem, // [SCOPE 043 / T010]
    public readonly helpCommand?: HelpCommand, // [SCOPE 042 / Help]
    public readonly helpItems?: HelpCommand[], // [SCOPE 042 / Help] — a category's commands
    public readonly video?: DocVideo, // [SCOPE 042 / Videos]
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
  private feedback: MyFeedbackItem[] = []; // [SCOPE 043 / T010]
  private helpCatalog: HelpCatalog = { standard: [], extended: [] }; // [SCOPE 042 / Help]
  private videos: DocVideo[] = []; // [SCOPE 042 / Videos]
  private videosLoaded = false; // [SCOPE 042 / Videos] — cache the network fetch until refresh
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
    this.videosLoaded = false; // [SCOPE 042 / Videos] — re-fetch the catalog on refresh
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
      if (element.kind === 'scope' && element.scope) {
        return element.scope.tasks.map((t) => taskNode(t, element.scope!));
      }
      // [SCOPE 043 / T010] expand the My Feedback group into item nodes.
      if (element.kind === 'feedback-group') {
        return this.feedback.map((f) => feedbackItemNode(f));
      }
      // [SCOPE 042 / Help] expand the Help group into Standard/Extended categories.
      if (element.kind === 'help-group') {
        const cats: CockpitNode[] = [];
        if (this.helpCatalog.standard.length > 0) cats.push(helpCategoryNode('Standard', this.helpCatalog.standard));
        if (this.helpCatalog.extended.length > 0) cats.push(helpCategoryNode('Extended', this.helpCatalog.extended));
        return cats;
      }
      // [SCOPE 042 / Help] expand a category into command items.
      if (element.kind === 'help-category') {
        return (element.helpItems ?? []).map(helpItemNode);
      }
      // [SCOPE 042 / Help] expand a command into its optional parameters.
      if (element.kind === 'help-item') {
        return (element.helpCommand?.params ?? []).map(helpParamNode);
      }
      // [SCOPE 042 / Videos] expand the Videos group into per-video items.
      if (element.kind === 'videos-group') {
        return this.videos.map(videoItemNode);
      }
      return [];
    }
    if (this.state === 'unloaded') {
      this.applyState(await this.computeState());
    }
    // [SCOPE 042 / Help] catalog is local-file based — load it independently of
    // the MCP load path so Help works in every state (incl. offline / no token).
    this.helpCatalog = loadCommandCatalog();
    // [SCOPE 042 / Videos] the docs index is public — load it independently of
    // the MCP load path (works without a token), best-effort and cached.
    if (!this.videosLoaded) {
      this.videos = await loadVideoCatalog();
      this.videosLoaded = true;
    }
    return this.withVideosSection(this.withHelpSection(this.rootNodes()));
  }

  private applyState(s: ComputedState): void {
    this.state = s.state;
    this.summary = s.summary;
    this.activeScope = s.activeScope;
    this.feedback = s.feedback;
    this.errorMsg = s.errorMsg;
    this.signature = s.signature;
  }

  // Resolve project + token + MCP read into a self-contained state snapshot.
  // Pure of side effects on `this` so both the load path and poll can use it.
  private async computeState(): Promise<ComputedState> {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const ctx = resolveProjectContext(folders);
    if (!ctx) {
      return { state: 'no-project', summary: null, activeScope: undefined, feedback: [], errorMsg: '', signature: 'no-project' };
    }

    let token: string | null = null;
    try {
      token = await resolveToken(this.secrets, ctx.projectRoot, ctx.projectId);
    } catch {
      token = null;
    }
    if (!token) {
      return { state: 'no-token', summary: null, activeScope: ctx.activeScope, feedback: [], errorMsg: '', signature: 'no-token' };
    }

    try {
      const client = new CockpitMcpClient({ baseUrl: ctx.mcpBaseUrl, token });
      const summary = await client.cockpitSummary(ctx.projectId);
      // [SCOPE 043 / T010] feedback is a secondary surface — never let it fail
      // the cockpit's primary remaining-work view.
      let feedback: MyFeedbackItem[] = [];
      try {
        feedback = await client.listMyFeedback(ctx.projectId);
      } catch {
        feedback = [];
      }
      const withWork = summary.scopes.filter((s) => s.remainingCount > 0);
      return {
        state: withWork.length === 0 ? 'empty' : 'ok',
        summary,
        activeScope: ctx.activeScope,
        feedback,
        errorMsg: '',
        signature: `${ctx.activeScope ?? ''}|${signatureOf(summary)}|${feedbackSignatureOf(feedback)}`,
      };
    } catch (err) {
      // Surface the resolved endpoint so a misconfig (e.g. falling back to
      // localhost when the hosted URL key is missing) is self-diagnosing.
      const msg = `Tried ${ctx.mcpBaseUrl} — ${(err as Error).message}`;
      return { state: 'error', summary: null, activeScope: ctx.activeScope, feedback: [], errorMsg: msg, signature: `error:${msg}` };
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
        return this.withFeedbackSection([
          messageNode('All caught up — no remaining work', 'check', 'No incomplete tasks in this project.'),
        ]);
      case 'ok': {
        const withWork = (this.summary?.scopes ?? []).filter((s) => s.remainingCount > 0);
        const sorted = [...withWork].sort((a, b) => {
          const aActive = a.specNumber === this.activeScope ? 0 : 1;
          const bActive = b.specNumber === this.activeScope ? 0 : 1;
          return aActive - bActive || a.specNumber.localeCompare(b.specNumber);
        });
        return this.withFeedbackSection(sorted.map((s) => scopeNode(s, s.specNumber === this.activeScope)));
      }
      default:
        return [];
    }
  }

  // [SCOPE 043 / T010] BEGIN — append the "My Feedback" group when the user has
  // submitted any. Collapsed by default, but auto-expanded (and badged) when an
  // item needs info, so the submitter notices without running a command.
  private withFeedbackSection(base: CockpitNode[]): CockpitNode[] {
    if (this.feedback.length === 0) return base;
    return [...base, feedbackGroupNode(this.feedback)];
  }
  // [SCOPE 043 / T010] END

  // [SCOPE 042 / Help] BEGIN — append the "Help — Commands" section in every
  // state. Omitted only when no _wxAI/commands directory was found.
  private withHelpSection(base: CockpitNode[]): CockpitNode[] {
    if (this.helpCatalog.standard.length === 0 && this.helpCatalog.extended.length === 0) return base;
    return [...base, helpGroupNode()];
  }
  // [SCOPE 042 / Help] END

  // [SCOPE 042 / Videos] BEGIN — append the "Help — Videos" section when the docs
  // index has at least one video. Omitted entirely when offline / none found.
  private withVideosSection(base: CockpitNode[]): CockpitNode[] {
    if (this.videos.length === 0) return base;
    return [...base, videosGroupNode(this.videos.length)];
  }
  // [SCOPE 042 / Videos] END
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

// [SCOPE 043 / T010] BEGIN — feedback node factories
function feedbackGroupNode(items: MyFeedbackItem[]): CockpitNode {
  const needsInfo = items.filter((f) => f.status === 'needsinfo').length;
  // Auto-expand when something needs the user's attention.
  const node = new CockpitNode(
    'feedback-group',
    'My Feedback',
    needsInfo > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
  );
  node.description = needsInfo > 0 ? `${needsInfo} need info` : `${items.length}`;
  node.iconPath = new vscode.ThemeIcon(needsInfo > 0 ? 'warning' : 'comment-discussion');
  node.tooltip = `Your bug reports & suggestions${needsInfo > 0 ? ` — ${needsInfo} awaiting your reply` : ''}`;
  node.contextValue = 'wxkanban.feedbackGroup';
  return node;
}

function feedbackItemNode(item: MyFeedbackItem): CockpitNode {
  const needsInfo = item.status === 'needsinfo';
  const node = new CockpitNode('feedback', item.title, vscode.TreeItemCollapsibleState.None, undefined, undefined, item);
  node.description = needsInfo ? 'needs info — click to reply' : item.status;
  node.iconPath = feedbackStatusIcon(item);
  node.contextValue = 'wxkanban.feedback';
  const lines = [
    `${item.type} · ${item.status}${item.severity ? ` · ${item.severity}` : ''}`,
    `ref ${item.referenceId.slice(0, 8)}`,
  ];
  if (item.duplicateOfId) lines.push('already received (linked to an existing report)');
  if (needsInfo && item.clarificationQuestion) lines.push(`\nwxperts asked: ${item.clarificationQuestion}`);
  if (item.status === 'declined' && item.declineReason) lines.push(`\ndeclined: ${item.declineReason}`);
  node.tooltip = lines.join('\n');
  // Needs-info items open the single-round reply; every other item opens a
  // read-only detail view of the body the submitter entered. [SCOPE 043 / T011]
  if (needsInfo) {
    node.command = {
      command: 'wxkanban.cockpit.answerFeedback',
      title: 'Answer',
      arguments: [item],
    };
  } else {
    node.command = {
      command: 'wxkanban.cockpit.showFeedbackDetail',
      title: 'View detail',
      arguments: [item],
    };
  }
  return node;
}

function feedbackStatusIcon(item: MyFeedbackItem): vscode.ThemeIcon {
  switch (item.status) {
    case 'needsinfo':
      return new vscode.ThemeIcon('question');
    case 'inprogress':
      return new vscode.ThemeIcon('sync');
    case 'resolved':
      return new vscode.ThemeIcon('pass');
    case 'declined':
      return new vscode.ThemeIcon('circle-slash');
    default:
      return new vscode.ThemeIcon(item.duplicateOfId ? 'copy' : 'comment');
  }
}
// [SCOPE 043 / T010] END

// [SCOPE 042 / Help] BEGIN — help node factories
function helpGroupNode(): CockpitNode {
  const node = new CockpitNode('help-group', 'Help — Commands', vscode.TreeItemCollapsibleState.Collapsed);
  node.iconPath = new vscode.ThemeIcon('book');
  node.tooltip = 'wxKanban kit commands — what each one does';
  node.contextValue = 'wxkanban.helpGroup';
  return node;
}

function helpCategoryNode(label: string, items: HelpCommand[]): CockpitNode {
  const node = new CockpitNode(
    'help-category',
    label,
    vscode.TreeItemCollapsibleState.Collapsed,
    undefined,
    undefined,
    undefined,
    undefined,
    items,
  );
  node.description = `${items.length}`;
  node.iconPath = new vscode.ThemeIcon('list-unordered');
  node.tooltip = label === 'Standard' ? 'Core lifecycle commands' : 'Additional _wxAI commands';
  node.contextValue = 'wxkanban.helpCategory';
  return node;
}

function helpItemNode(cmd: HelpCommand): CockpitNode {
  // Commands with documented optional params expand into a param list; the rest
  // stay as leaves. Clicking the label still opens the full command help.
  const hasParams = cmd.params.length > 0;
  const node = new CockpitNode(
    'help-item',
    `/${cmd.name}`,
    hasParams ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    undefined,
    undefined,
    undefined,
    cmd,
  );
  node.description = cmd.blurb;
  node.tooltip = cmd.blurb || `/${cmd.name}`;
  node.iconPath = new vscode.ThemeIcon('terminal');
  node.contextValue = 'wxkanban.helpItem';
  node.command = {
    command: 'wxkanban.cockpit.openCommandHelp',
    title: 'Open command help',
    arguments: [cmd],
  };
  return node;
}

function helpParamNode(param: HelpParam): CockpitNode {
  const node = new CockpitNode('help-param', param.name, vscode.TreeItemCollapsibleState.None);
  node.description = param.blurb;
  node.tooltip = param.blurb ? `${param.name} (optional) — ${param.blurb}` : `${param.name} (optional)`;
  node.iconPath = new vscode.ThemeIcon('symbol-parameter');
  node.contextValue = 'wxkanban.helpParam';
  return node;
}
// [SCOPE 042 / Help] END

// [SCOPE 042 / Videos] BEGIN — video node factories
function videosGroupNode(count: number): CockpitNode {
  const node = new CockpitNode('videos-group', 'Help — Videos', vscode.TreeItemCollapsibleState.Collapsed);
  node.description = `${count}`;
  node.iconPath = new vscode.ThemeIcon('device-camera-video');
  node.tooltip = 'How-to videos from the wxKanban docs — click to watch in your browser';
  node.contextValue = 'wxkanban.videosGroup';
  return node;
}

function videoItemNode(v: DocVideo): CockpitNode {
  const node = new CockpitNode(
    'video-item',
    v.title,
    vscode.TreeItemCollapsibleState.None,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    v,
  );
  node.description = v.summary;
  node.tooltip = v.summary ? `${v.title} — ${v.summary}\n${v.pageUrl}` : v.pageUrl;
  node.iconPath = new vscode.ThemeIcon('play-circle');
  node.contextValue = 'wxkanban.video';
  node.command = {
    command: 'wxkanban.cockpit.openVideo',
    title: 'Watch video',
    arguments: [v],
  };
  return node;
}
// [SCOPE 042 / Videos] END

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

// [SCOPE 043 / T010] BEGIN — feedbackSignatureOf (so poll repaints on status changes)
function feedbackSignatureOf(items: MyFeedbackItem[]): string {
  return items.map((f) => `${f.id}=${f.status}`).join(',');
}
// [SCOPE 043 / T010] END
