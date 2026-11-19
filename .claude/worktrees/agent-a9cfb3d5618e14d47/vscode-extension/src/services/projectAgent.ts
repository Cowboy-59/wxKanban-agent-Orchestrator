import * as vscode from 'vscode';
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ProjectContext } from './projectContext.js';
import { resolveToken } from './auth.js';
import { resolveChatConfig } from './chatSocket.js';
import {
  LineSplitter,
  decideAutoStart,
  failureText,
  fetchRemoteSettings,
  offReasonText,
  parseAgentLine,
  type OffReason,
} from './remoteStartup.js';

// The Cockpit only STARTS A PROCESS. The agent itself — the SCOPE-102 bridge in
// project-agent mode — is the kit's; nothing here calls AI, which keeps SCOPE-019 R6a
// ("VS Code commands never call kit-internal AI") intact (SCOPE-132 FR-021).
//
// One agent per project window. The bridge enforces one agent per working tree itself
// (FR-026), so a second window on the same tree gets a plain refusal rather than a second agent.

/** Where the kit keeps the launcher, relative to the project root. */
const LAUNCHER = join('wxkanban-agent', 'apps', 'remote-bridge', 'bin', 'project-agent.mjs');

/** SPEC-145 FR-007: how long a clean stop may take before the whole tree is ended. */
const STOP_GRACE_MS = 6000;

// [SCOPE 145 / T009] BEGIN — RemoteStatusBar: one status bar item for the remote (FR-006)
export type RemoteState =
  | { kind: 'off'; reason: OffReason }
  | { kind: 'starting' }
  | { kind: 'live'; sharing: boolean }
  | { kind: 'failed'; code: string }
  | { kind: 'stopped' };

// [SCOPE 155 / T007] BEGIN — read the local sharing switch (FR-005)
/**
 * `wxkanban.projectAgent.shareStatus` (per workspace, default on). Read fresh each time the
 * status bar renders a live state, rather than cached, so flipping it in Settings takes effect
 * immediately in the status bar text — independent of the next heartbeat (FR-003) actually
 * clearing/resuming the shared content.
 */
export function shareStatusEnabled(): boolean {
  return vscode.workspace.getConfiguration('wxkanban.projectAgent').get<boolean>('shareStatus', true);
}
// [SCOPE 155 / T007] END

// MODIFIED-BY: [SCOPE 155 / T007] — the 'live' case now reads sharing state (FR-005)
export function remoteStatusText(state: RemoteState): { text: string; tooltip: string } {
  switch (state.kind) {
    case 'off':
      return { text: '$(debug-disconnect) Remote: off', tooltip: offReasonText(state.reason) };
    case 'starting':
      return { text: '$(sync~spin) Remote: starting', tooltip: 'The project agent is connecting to the project room.' };
    case 'live':
      return state.sharing
        ? {
            text: '$(broadcast) Remote: live · sharing status',
            tooltip: 'The project agent is connected to the project room and sharing this session’s status with K.A.I.N.',
          }
        : { text: '$(broadcast) Remote: live', tooltip: 'The project agent is connected to the project room.' };
    case 'failed':
      return { text: '$(error) Remote: failed', tooltip: failureText(state.code) };
    case 'stopped':
      return { text: '$(circle-slash) Remote: stopped', tooltip: 'The project agent is not running.' };
  }
}

class RemoteStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);

  constructor() {
    // Clicking the item opens the agent's output, whatever the state.
    this.item.command = 'wxkanban.cockpit.showProjectAgentOutput';
  }

  show(state: RemoteState): void {
    const { text, tooltip } = remoteStatusText(state);
    this.item.text = text;
    this.item.tooltip = tooltip;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
// [SCOPE 145 / T009] END

// [SCOPE 145 / T010] BEGIN — killTree: end the agent and everything it started (FR-007)
/**
 * Windows: `child.kill()` ends only the launcher; the bridge it started keeps running
 * (found 2026-10-25). `taskkill /T` ends the whole tree. Elsewhere SIGKILL on the launcher
 * is enough, because the bridge exits when the launcher's stdin pipe closes.
 */
export function killTree(child: ChildProcess, platform: NodeJS.Platform = process.platform): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  child.kill('SIGKILL');
}
// [SCOPE 145 / T010] END

// [SCOPE 145 / T008] BEGIN — ProjectAgentProcess: start, watch, report and stop the project agent (replaces 134/T033)
// SPEC-145 FR-001 – FR-007. Started on demand, or on open where the project allows remote
// (autoStart). The agent's own output says when it is live or why it refused; the status bar
// and one notification say so here. Stopping closes the agent's stdin first — the bridge's
// clean shutdown posts the disconnect notice and releases the lock — then ends the whole tree
// if it is still running after a grace period. Because stdin is a pipe from this process, the
// bridge also shuts down cleanly when VS Code itself goes away.
export interface ProjectAgentDeps {
  spawn: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  killTree: (child: ChildProcess) => void;
  launcherExists: (path: string) => boolean;
  readyTimeoutMs: () => number;
  autoStartEnabled: () => boolean;
}

const defaultDeps: ProjectAgentDeps = {
  spawn: (command, args, options) => spawn(command, args, options),
  killTree: (child) => killTree(child),
  launcherExists: (path) => existsSync(path),
  readyTimeoutMs: () =>
    Math.max(10, vscode.workspace.getConfiguration('wxkanban.projectAgent').get<number>('readyTimeoutSeconds', 90)) * 1000,
  autoStartEnabled: () => vscode.workspace.getConfiguration('wxkanban.projectAgent').get<boolean>('autoStart', true),
};

export class ProjectAgentProcess implements vscode.Disposable {
  private child?: ChildProcess;
  private stopping = false;
  private refusedCode?: string;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private state: RemoteState = { kind: 'stopped' };
  private readonly output = vscode.window.createOutputChannel('wxKanban Project Agent');
  private readonly statusBar = new RemoteStatusBar();

  constructor(private readonly deps: ProjectAgentDeps = defaultDeps) {}

  get isRunning(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed;
  }

  get currentState(): RemoteState {
    return this.state;
  }

  /**
   * On open (FR-001): start only when the developer's switch is on AND the server says the
   * project allows remote. Otherwise the status bar says why — never a pop-up.
   */
  async autoStart(ctx: ProjectContext, secrets: vscode.SecretStorage): Promise<void> {
    if (!this.deps.autoStartEnabled()) {
      this.setState({ kind: 'off', reason: 'switched_off' });
      return;
    }
    const token = await resolveToken(secrets, ctx.projectRoot, ctx.projectId);
    const settings = token ? await fetchRemoteSettings(resolveChatConfig().wxkanbanBaseUrl, token) : null;
    const decision = decideAutoStart(true, settings);
    if (!decision.start) {
      this.output.appendLine(`[cockpit] remote not started: ${offReasonText(decision.reason)}`);
      this.setState({ kind: 'off', reason: decision.reason });
      return;
    }
    this.start(ctx.projectRoot, { quiet: true });
  }

  /** Start the agent for the project at `projectRoot`. No-op (with a notice) if running. */
  start(projectRoot: string, opts: { quiet?: boolean } = {}): boolean {
    if (this.isRunning) {
      if (!opts.quiet) void vscode.window.showInformationMessage('wxKanban: the project agent is already running.');
      return false;
    }
    const launcher = join(projectRoot, LAUNCHER);
    if (!this.deps.launcherExists(launcher)) {
      void vscode.window.showWarningMessage(
        'wxKanban: this project\'s kit has no project agent yet. Upgrade the kit to start one.',
      );
      return false;
    }

    this.output.appendLine(`[cockpit] starting project agent in ${projectRoot}`);
    this.stopping = false;
    this.refusedCode = undefined;
    // `node` from PATH: the kit already requires Node >= 20 there (kit wrappers). stdin is a
    // pipe the bridge watches (WXKANBAN_STOP_ON_STDIN_CLOSE): closing it is the stop signal
    // that works on Windows, where kill() delivers no SIGTERM.
    const child = this.deps.spawn('node', [launcher], {
      cwd: projectRoot,
      env: { ...process.env, WXKANBAN_STOP_ON_STDIN_CLOSE: '1' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.setState({ kind: 'starting' });
    this.armReadyTimer(child);

    const lines = new LineSplitter();
    const onData = (d: Buffer): void => {
      const text = d.toString();
      this.output.append(text);
      for (const line of lines.push(text)) this.onAgentLine(line);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (d: Buffer) => this.output.append(d.toString()));
    child.on('exit', (code) => this.onExit(child, code));
    child.on('error', (err) => this.output.appendLine(`[cockpit] failed to start: ${err.message}`));
    return true;
  }

  /** Stop the agent cleanly, then end the whole tree if it has not gone within the grace period. */
  stop(): boolean {
    if (!this.isRunning || !this.child) return false;
    const child = this.child;
    this.stopping = true;
    this.clearReadyTimer();
    this.output.appendLine('[cockpit] stopping project agent');
    child.stdin?.end();
    const grace = setTimeout(() => {
      if (child.exitCode === null) {
        this.output.appendLine('[cockpit] the project agent did not stop in time; ending its process tree');
        this.deps.killTree(child);
      }
    }, STOP_GRACE_MS);
    grace.unref?.();
    return true;
  }

  showOutput(): void {
    this.output.show(true);
  }

  dispose(): void {
    // The stdin close is what matters here: VS Code may not wait for the grace timer, and
    // the bridge shuts itself down when the pipe closes even if this process is gone.
    this.stop();
    this.statusBar.dispose();
    this.output.dispose();
  }

  private onAgentLine(line: string): void {
    const parsed = parseAgentLine(line);
    if (!parsed) return;
    if (parsed.type === 'refused') {
      this.refusedCode = parsed.code;
      return;
    }
    // Ready: the "connected" post has landed in the room.
    this.clearReadyTimer();
    if (this.state.kind !== 'live') {
      this.setState({ kind: 'live', sharing: shareStatusEnabled() }); // [SCOPE 155 / T007]
      void vscode.window.showInformationMessage('wxKanban: Remote is live — the project agent is in the project room.');
    }
  }

  private onExit(child: ChildProcess, code: number | null): void {
    this.output.appendLine(`[cockpit] project agent exited (code ${code ?? 'signal'})`);
    if (this.child !== child) return;
    this.child = undefined;
    this.clearReadyTimer();
    if (this.stopping || this.state.kind === 'live') {
      this.setState({ kind: 'stopped' });
      return;
    }
    this.fail(this.refusedCode ?? 'exited');
  }

  private armReadyTimer(child: ChildProcess): void {
    this.clearReadyTimer();
    this.readyTimer = setTimeout(() => {
      if (this.child === child && this.state.kind === 'starting') this.fail('timeout');
    }, this.deps.readyTimeoutMs());
    this.readyTimer.unref?.();
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = undefined;
  }

  private fail(code: string): void {
    this.setState({ kind: 'failed', code });
    void vscode.window.showWarningMessage(`wxKanban: ${failureText(code)}`, 'Show output').then((pick) => {
      if (pick === 'Show output') this.output.show(true);
    });
  }

  private setState(state: RemoteState): void {
    this.state = state;
    this.statusBar.show(state);
  }
}
// [SCOPE 145 / T008] END
