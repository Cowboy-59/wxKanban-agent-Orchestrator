// SCOPE-137 / T011 (FR-010) — Change Impact in the Cockpit: the VS Code half.
//
// One controller owns every view, all fed from the kit's .wxai/impact.json:
//   - a status bar count (click opens the agree panel);
//   - Explorer badges on the files a change affects;
//   - Information-level Problems entries on the changed file;
//   - a CodeLens on every fence line: used by N files · N scopes;
//   - the agree panel: the affected list, a small diagram, and Agree / Undo for a hand edit.
//
// A hand save is checked against the file as it was just before the save. If the change asks
// (an Impact Boundary) or stops (possible data loss), the panel opens by itself and the status
// bar keeps asking until the developer answers; a notify-only change never opens it. An AI edit
// the Claude Code hook already settled is recognized by its content hash and not asked twice.
// VS Code cannot block a save, so the answer comes after it: Agree records it, Undo restores
// the file as it was.
import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import * as path from 'path';
import {
  changeHash,
  diagnosticMessage,
  isHookSettled,
  lensTitle,
  needsAnswer,
  renderPanelHtml,
  shouldAutoOpen,
  statusText,
  toView,
  type Decision,
  type FenceUsage,
  type ImpactReport,
  type ImpactView,
} from '../services/impactModel.js';
import { acknowledgeHandEdit, checkSavedFile, fenceUsage, hasImpactKit, hookStatus, installHook, queueChatRelay } from '../services/impactRunner.js';
import { resolveProjectContext } from '../services/projectContext.js';
import { resolveToken } from '../services/auth.js';

// [SCOPE 137 / T011] BEGIN — Change Impact controller: status bar, badges, Problems, CodeLens, agree panel (FR-010)
// MODIFIED-BY: [SCOPE 137 / T022] — the self-opening agree panel also queues its content for the chat relay; the on-click case does not (Amendment C, FR-010a)
const MAX_TRACKED_BYTES = 2 * 1024 * 1024;
const SKIP = [/^\.git\//, /^node_modules\//, /^\.wxai\//, /^dist\//];
const PENDING_KEY = 'wxkanban.impact.pending';

class FenceLens extends vscode.CodeLens {
  constructor(range: vscode.Range, readonly file: string, readonly version: number) {
    super(range);
  }
}

interface Pending {
  file: string; // repo-relative
  decision: Decision;
  hash: string;
  before: string | null; // null: the file did not exist before the save
  report: ImpactReport;
}

export class ImpactController implements vscode.FileDecorationProvider, vscode.CodeLensProvider, vscode.Disposable {
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('wxkanban-impact');
  private readonly decorationsChanged = new vscode.EventEmitter<vscode.Uri[] | undefined>();
  private readonly lensesChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeFileDecorations = this.decorationsChanged.event;
  readonly onDidChangeCodeLenses = this.lensesChanged.event;

  private view: ImpactView | null = null;
  private origin: 'hand' | 'hook' = 'hand';
  private affected = new Map<string, { types: string[]; confidence: string; from: string }>();
  private preSave = new Map<string, string | null>();
  private timers = new Map<string, NodeJS.Timeout>();
  private lensCache = new Map<string, { version: number; usage: Promise<FenceUsage[] | null> }>();
  private panel: vscode.WebviewPanel | undefined;
  private pending: Pending | null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext, private readonly root: string) {
    this.pending = context.workspaceState.get<Pending>(PENDING_KEY) ?? null;
    this.status.command = 'wxkanban.impact.showPanel';
    this.renderStatus();
    this.status.show();

    this.disposables.push(
      this.status,
      this.diagnostics,
      vscode.window.registerFileDecorationProvider(this),
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this),
      vscode.workspace.onWillSaveTextDocument((e) => this.capturePreSave(e.document)),
      vscode.workspace.onDidSaveTextDocument((doc) => this.scheduleCheck(doc)),
    );
    // The Claude Code hook writes the same file for AI edits; follow it.
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.wxai/impact.json'));
    watcher.onDidChange(() => this.loadReportFromDisk());
    watcher.onDidCreate(() => this.loadReportFromDisk());
    this.disposables.push(watcher);
    this.loadReportFromDisk();
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.panel?.dispose();
    for (const d of this.disposables) d.dispose();
  }

  // ---- saves -------------------------------------------------------------------------------
  private rel(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'file') return null;
    const r = path.relative(this.root, uri.fsPath).replace(/\\/g, '/');
    if (!r || r.startsWith('..') || path.isAbsolute(r) || SKIP.some((re) => re.test(r))) return null;
    return r;
  }

  /** The file as it is on disk right before VS Code writes the save over it. */
  private capturePreSave(doc: vscode.TextDocument): void {
    const r = this.rel(doc.uri);
    if (!r) return;
    try {
      if (!existsSync(doc.uri.fsPath)) {
        this.preSave.set(r, null);
      } else if (statSync(doc.uri.fsPath).size <= MAX_TRACKED_BYTES) {
        this.preSave.set(r, readFileSync(doc.uri.fsPath, 'utf8'));
      }
    } catch {
      /* best-effort */
    }
  }

  private scheduleCheck(doc: vscode.TextDocument): void {
    const r = this.rel(doc.uri);
    if (!r || !this.preSave.has(r)) return;
    const before = this.preSave.get(r) ?? null;
    this.preSave.delete(r);
    const content = doc.getText();
    if (before === content) return; // saved with no change
    const existing = this.timers.get(r);
    if (existing) clearTimeout(existing);
    // Short debounce: the views must settle within 3 s of a save (FR-010).
    this.timers.set(r, setTimeout(() => {
      this.timers.delete(r);
      void this.checkHandSave(r, before, content);
    }, 250));
  }

  private async checkHandSave(r: string, before: string | null, content: string): Promise<void> {
    if (isHookSettled(this.readReport(), r, content)) {
      this.loadReportFromDisk(); // an AI edit the hook already handled: show it, do not ask again
      return;
    }
    const report = await checkSavedFile(this.root, r, before);
    if (!report) return;
    this.show(report, 'hand');
    const view = toView(report);
    if (needsAnswer(view, 'hand')) {
      this.pending = { file: r, decision: view.decision, hash: changeHash(r, content), before, report };
      await this.context.workspaceState.update(PENDING_KEY, this.pending);
      this.renderStatus();
      if (shouldAutoOpen(view, 'hand')) {
        // Self-opening only (never the plain-click case): also post this into chat (Amendment C, FR-010a).
        queueChatRelay(this.root, { hash: this.pending.hash, file: r });
        this.openPanel();
      }
    }
  }

  // ---- report → views ----------------------------------------------------------------------
  private readReport(): ImpactReport | null {
    try {
      return JSON.parse(readFileSync(path.join(this.root, '.wxai', 'impact.json'), 'utf8')) as ImpactReport;
    } catch {
      return null;
    }
  }

  private loadReportFromDisk(): void {
    const report = this.readReport();
    if (report) this.show(report, report.origin === 'hook' ? 'hook' : 'hand');
  }

  private show(report: ImpactReport, origin: 'hand' | 'hook'): void {
    this.view = toView(report);
    this.origin = origin;
    this.affected = new Map(this.view.affected.map((a) => [a.file, a]));
    this.decorationsChanged.fire(undefined);
    this.diagnostics.clear();
    for (const f of this.view.changed) {
      if (this.view.decision === 'none' && !this.view.affected.length) continue;
      const d = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), diagnosticMessage(this.view), vscode.DiagnosticSeverity.Information);
      d.source = 'wxKanban Change Impact';
      this.diagnostics.set(vscode.Uri.file(path.join(this.root, f)), [d]);
    }
    this.lensCache.clear();
    this.lensesChanged.fire();
    this.renderStatus();
    if (this.panel) this.renderPanel();
  }

  private renderStatus(): void {
    const s = statusText(this.view, this.pending ? { decision: this.pending.decision, file: this.pending.file } : null);
    this.status.text = s.text;
    this.status.tooltip = s.tooltip;
    this.status.backgroundColor =
      s.severity === 'error' ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : s.severity === 'warning' ? new vscode.ThemeColor('statusBarItem.warningBackground')
          : undefined;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const r = this.rel(uri);
    const a = r ? this.affected.get(r) : undefined;
    if (!a) return undefined;
    return {
      badge: '↯',
      tooltip: `Affected by your change to ${a.from} (${a.types.join(', ')}, ${a.confidence})`,
      color: new vscode.ThemeColor(this.view?.boundary ? 'list.warningForeground' : 'descriptionForeground'),
    };
  }

  // ---- fence CodeLens ----------------------------------------------------------------------
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const r = this.rel(doc.uri);
    if (!r || !hasImpactKit(this.root)) return [];
    const lenses: vscode.CodeLens[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
      if (/^[ \t]*(?:\/\/|--|<!--|#|\/\*|\x7b\/\*)[ \t]*\[SCOPE\s+\d{3}\s*\/\s*T\d+\]\s*BEGIN/.test(doc.lineAt(i).text)) {
        lenses.push(new FenceLens(new vscode.Range(i, 0, i, 0), r, doc.version));
      }
    }
    return lenses;
  }

  async resolveCodeLens(lens: vscode.CodeLens): Promise<vscode.CodeLens> {
    if (!(lens instanceof FenceLens)) return lens;
    const r = lens.file;
    const doc = { version: lens.version };
    let cached = this.lensCache.get(r);
    if (!cached || cached.version !== doc.version) {
      cached = { version: doc.version, usage: fenceUsage(this.root, r) };
      this.lensCache.set(r, cached);
    }
    const usage = await cached.usage;
    const f = usage?.find((u) => u.line === lens.range.start.line + 1);
    lens.command = f
      ? { title: lensTitle(f), command: 'wxkanban.impact.showFenceUsers', arguments: [f] }
      : { title: 'Change Impact: usage not available', command: '' };
    return lens;
  }

  async showFenceUsers(f: FenceUsage): Promise<void> {
    if (!f || f.internal || !f.files.length) return;
    const pick = await vscode.window.showQuickPick(f.files, { placeHolder: `${f.symbols.join(', ')} — used by` });
    if (pick) await vscode.window.showTextDocument(vscode.Uri.file(path.join(this.root, pick)));
  }

  // ---- agree panel -------------------------------------------------------------------------
  openPanel(): void {
    if (!this.view && !this.pending) {
      void vscode.window.showInformationMessage('Change Impact: nothing checked yet. Save a file to see what it affects.');
      return;
    }
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel('wxkanban.impact', 'Change Impact', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: false });
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.onDidReceiveMessage((m: { type?: string; file?: string; dataLossConfirmed?: boolean }) => void this.onPanelMessage(m));
    }
    this.renderPanel();
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const view = this.pending ? toView(this.pending.report) : this.view;
    if (!view) return;
    this.panel.webview.html = renderPanelHtml(view, {
      nonce: randomBytes(16).toString('base64'),
      cspSource: this.panel.webview.cspSource,
      answer: Boolean(this.pending),
    });
  }

  private async onPanelMessage(m: { type?: string; file?: string; dataLossConfirmed?: boolean }): Promise<void> {
    if (m.type === 'open' && m.file) {
      await vscode.window.showTextDocument(vscode.Uri.file(path.join(this.root, m.file)), { preview: true });
      return;
    }
    const p = this.pending;
    if (!p) return;
    if (m.type === 'agree') {
      if (p.decision === 'stop' && !m.dataLossConfirmed) return;
      await this.record(p, 'agree');
      vscode.window.showInformationMessage(`Change Impact: you agreed to the change to ${p.file}.`);
    } else if (m.type === 'undo') {
      const uri = vscode.Uri.file(path.join(this.root, p.file));
      if (p.before === null) {
        await vscode.workspace.fs.delete(uri, { useTrash: true });
      } else {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(p.before, 'utf8'));
      }
      await this.record(p, 'undo');
      vscode.window.showInformationMessage(`Change Impact: ${p.file} is back as it was before your save.`);
    } else {
      return;
    }
    this.pending = null;
    await this.context.workspaceState.update(PENDING_KEY, undefined);
    this.renderStatus();
    this.renderPanel();
  }

  private async record(p: Pending, answer: 'agree' | 'undo'): Promise<void> {
    const ctx = resolveProjectContext([this.root]);
    const token = ctx ? await resolveToken(this.context.secrets, ctx.projectRoot, ctx.projectId) : null;
    const out = await acknowledgeHandEdit(this.root, { answer, hash: p.hash, actor: gitUser(this.root), token });
    if (!out?.ok) {
      vscode.window.showWarningMessage(`Change Impact: your answer was applied but could not be recorded (${out?.error ?? 'the kit did not respond'}).`);
    } else if (out.duplicate) {
      // Already answered from chat for this exact hash (Amendment C, FR-010a) — no second log entry.
      vscode.window.showInformationMessage('Change Impact: this was already answered in chat.');
    } else if (out.queued) {
      vscode.window.showInformationMessage('Change Impact: wxKanban is unreachable; your answer is queued and will be sent when it is back.');
    }
  }

  // ---- the Claude Code hook ----------------------------------------------------------------
  /** Install the AI-edit hook if the kit has it and it is missing or out of date (FR-008). */
  async ensureHook(): Promise<void> {
    const state = await hookStatus(this.root);
    if (state === 'missing' || state === 'stale') {
      if (await installHook(this.root)) {
        void vscode.window.showInformationMessage(
          'wxKanban: Change Impact is now checked before Claude edits code. It asks you at an Impact Boundary and stops on possible data loss.',
        );
      }
    }
  }
}

function gitUser(root: string): string {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    if (name) return name;
  } catch {
    /* no git identity */
  }
  return process.env.USERNAME ?? process.env.USER ?? 'developer';
}

/** Wire Change Impact into the Cockpit. No-op outside a wxKanban project or without the kit's engine. */
export function registerChangeImpact(context: vscode.ExtensionContext): void {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const ctx = resolveProjectContext(folders);
  if (!ctx || !hasImpactKit(ctx.projectRoot)) return;
  const controller = new ImpactController(context, ctx.projectRoot);
  context.subscriptions.push(
    controller,
    vscode.commands.registerCommand('wxkanban.impact.showPanel', () => controller.openPanel()),
    vscode.commands.registerCommand('wxkanban.impact.showFenceUsers', (f: FenceUsage) => controller.showFenceUsers(f)),
    vscode.commands.registerCommand('wxkanban.impact.installHook', async () => {
      const ok = await installHook(ctx.projectRoot);
      void vscode.window.showInformationMessage(ok ? 'Change Impact hook installed for Claude Code.' : 'Change Impact hook could not be installed; see .claude/settings.json.');
    }),
    vscode.commands.registerCommand('wxkanban.impact.uninstallHook', async () => {
      const ok = await installHook(ctx.projectRoot, true);
      void vscode.window.showInformationMessage(ok ? 'Change Impact hook removed.' : 'Change Impact hook could not be removed.');
    }),
  );
  void controller.ensureHook();
}
// [SCOPE 137 / T011] END
