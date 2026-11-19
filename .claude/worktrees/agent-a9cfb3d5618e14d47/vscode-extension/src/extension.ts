import * as vscode from 'vscode';
import { CockpitTreeProvider, CockpitNode } from './providers/cockpitTreeProvider.js';
import { showTaskDetail } from './providers/detailPanel.js';
import { showFeedbackDetail } from './providers/feedbackDetailPanel.js'; // [SCOPE 043 / T011]
import { openRelatedSpec } from './commands/openSpec.js';
import { myFeedback, answerFeedbackItem, pushFeedbackToChat } from './commands/feedback.js'; // [SCOPE 043 / T004, T010, T011b]
import { openFeedbackPanel } from './providers/feedbackPanel.js'; // [SCOPE 043 / T009]
import { openChatPanel } from './providers/chatPanel.js'; // [SCOPE 079 / T05]
import { openManual } from './services/manual.js'; // [SCOPE 141 / T027]
import type { MyFeedbackItem } from './types.js';
import type { HelpCommand } from './services/helpCatalog.js'; // [SCOPE 042 / Help]
import type { DocVideo } from './services/videosCatalog.js'; // [SCOPE 042 / Videos]
import type { FaqEntry } from './services/faqCatalog.js'; // [SCOPE 066 / T008]
import type { GuideVariant } from './services/guidesCatalog.js'; // [SCOPE 066 / Guides]
import { storeToken } from './services/auth.js';
import { resolveProjectContext } from './services/projectContext.js';
import { materializeStackOnOpen } from './services/materializeStack.js'; // [SCOPE 055]
import { registerScopeDepsWatcher } from './services/scopeDepsWatcher.js'; // [SCOPE 073 / T010]
import { ScopeClaimProvider } from './providers/scopeDecorations.js'; // [SCOPE 058 / T013]
import { checkoutScope, checkinScope } from './commands/scopeCheckout.js'; // [SCOPE 058 / T010]
import { checkCommands, installCommands } from './services/commandsInstall.js'; // [SCOPE 060 / Cockpit]
import {
  checkKitUpdate,
  runKitUpgrade,
  runKitVersionCheck, // [SCOPE 083 / T010]
  ensureKitInstalled, // [SCOPE 083 / T006]
  bootstrapKit, // [SCOPE 083 / T008]
} from './services/kitUpdate.js'; // [SCOPE 019 / R15]
import { checkSystemHealth } from './services/healthCheck.js'; // [SCOPE 094 / T004]
import { ProjectAgentProcess } from './services/projectAgent.js'; // [SCOPE 134 / T033]
import { registerChangeImpact } from './providers/impactViews.js'; // [SCOPE 137 / T011]
import { registerAutopilotView } from './providers/autopilotTreeProvider.js'; // [SCOPE 154 / T014]
import type { CockpitScope, CockpitTask } from './types.js';

// Fallback poll cadence — the kit's emitted refresh URI (T021) is the primary,
// immediate signal; this only catches work changed outside this IDE, and only
// fires while the view is visible.
const POLL_INTERVAL_MS = 30_000;

// [SCOPE 043 / T033] BEGIN — feedback commands receive a NODE from menus (FR-029)
// A row click passes the item itself (`arguments: [item]`), but VS Code hands an inline or
// context-menu command the tree element — the CockpitNode — whose item sits on
// `feedbackItem`. Treating the node as the item built a prompt of undefined fields
// (feedback b4d8b0c6). Accept either; anything else is not a feedback item.
function feedbackItemFrom(arg: unknown): MyFeedbackItem | undefined {
  if (arg instanceof CockpitNode) return arg.feedbackItem;
  if (arg && typeof arg === 'object' && typeof (arg as MyFeedbackItem).referenceId === 'string') {
    return arg as MyFeedbackItem;
  }
  return undefined;
}
// [SCOPE 043 / T033] END

// [SCOPE 042 / T009] BEGIN — extension activation: wire the Dev Cockpit view, detail panel, and commands
export function activate(context: vscode.ExtensionContext): void {
  // [SCOPE 058 / T013] scope claim decorations + FR-008 editor read-only, fed each
  // refresh by the tree provider's claim sink.
  const claimProvider = new ScopeClaimProvider();
  const treeProvider = new CockpitTreeProvider(context.secrets, (summary) => claimProvider.update(summary));
  const treeView = vscode.window.createTreeView('wxkanban.cockpit', { treeDataProvider: treeProvider });

  // Surface the running extension version in the view header so the deployed
  // build is always visible at a glance. Read from our own manifest so it tracks
  // the pre-push auto-bump automatically.
  // [SCOPE 134 / T033] The kit's project agent, started on demand or at startup (FR-034).
  // [SCOPE 145 / T007] On open it starts only where the project allows remote and the
  // developer's switch is on; otherwise the status bar says why (SCOPE-132 Amendment B).
  const projectAgent = new ProjectAgentProcess();
  context.subscriptions.push(projectAgent);
  {
    const ctx = resolveProjectContext((vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath));
    if (ctx) void projectAgent.autoStart(ctx, context.secrets);
  }

  const cockpitVersion = (context.extension.packageJSON as { version?: string }).version;
  treeView.title = cockpitVersion ? `Dev Cockpit v${cockpitVersion}` : 'Dev Cockpit';

  // [SCOPE 055] On open, materialize stack.md from the project's ProjectStack doc
  // (DB source of truth). Best-effort and non-destructive; never blocks activation.
  void materializeStackOnOpen(context.secrets);

  // [SCOPE 073 / T010] Editor capture: push scope dependency edges to the scope-flow
  // graph whenever a specs/Project-Scope/*.md is saved. Best-effort; never blocks.
  registerScopeDepsWatcher(context, context.secrets);

  // [SCOPE 137 / T011] Change Impact: status bar, Explorer badges, Problems entries, fence
  // CodeLens and the agree panel, all from the kit's .wxai/impact.json; installs the Claude Code
  // hook that asks before an AI edit crosses an Impact Boundary. No-op without the kit's engine.
  registerChangeImpact(context);
  registerAutopilotView(context); // [SCOPE 154 / T014] read-only "Autopilot" Cockpit tree

  // [SCOPE 060 / Cockpit] One-time nudge on activation: if the kit's slash
  // commands aren't in .claude/commands/, offer to install them so / commands
  // work in Claude Code. The Cockpit tree also shows a persistent click-to-install
  // row while any are missing.
  {
    const s = checkCommands();
    if (s.root && s.actionNeeded) {
      const n = s.missing.length;
      const msg = n > 0
        ? `${n} wxKanban slash command${n === 1 ? '' : 's'} aren't installed for Claude Code.`
        : 'wxKanban slash commands are outdated.';
      void vscode.window.showInformationMessage(msg, 'Install').then((pick) => {
        if (pick === 'Install') void vscode.commands.executeCommand('wxkanban.cockpit.installCommands');
      });
    }
  }

  // [SCOPE 083 / T006] Amendment A — the Cockpit now owns kit install state.
  // Three cases, resolved on every activation: no kit here at all (offer to
  // bootstrap one), kit behind the published release (start the visible upgrade
  // terminal without waiting for a click), or the Cockpit itself just updated
  // from the Marketplace (close the skew SCOPE-086 introduced). Guards inside —
  // author repo, WXKANBAN_NO_KIT_UPDATE_CHECK, and an uncommitted working tree —
  // all degrade to the existing click-to-install row. Best-effort; never blocks.
  void ensureKitInstalled(context);

  // [SCOPE 094 / T004] BEGIN — proactive startup health check.
  // Probe the orchestrator/MCP connection on activation (independent of whether the
  // Cockpit view is visible) so a broken connection is obvious before the developer
  // runs a kit command. The Cockpit tree also renders a persistent "System Health"
  // row; this adds a one-time toast only when something is actually wrong. The probe
  // uses the auth-exempt /health, so it needs no token. Best-effort; never blocks.
  void (async () => {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const health = await checkSystemHealth(folders);
    if (health.overall === 'offline' || health.overall === 'degraded') {
      const detail =
        health.overall === 'offline'
          ? `Can't reach the orchestrator/MCP at ${health.mcp.endpoint} (${health.mcp.error}). Kit commands won't sync until it's reachable.`
          : `The hub at ${health.mcp.endpoint} reports its database is down — writes will fail until it recovers.`;
      void vscode.window.showWarningMessage(`wxKanban: ${detail}`, 'Retry').then((pick) => {
        if (pick === 'Retry') treeProvider.refresh();
      });
    }
  })();
  // [SCOPE 094 / T004] END

  // [SCOPE 042 / T021] BEGIN — emitted-command refresh: the kit pings
  // vscode://wxperts.wxkanban-dev-cockpit/refresh after dbpush/implement so the
  // cockpit re-queries immediately, no manual action.
  const uriHandler = vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri): void {
      if (uri.path === '/refresh') {
        treeProvider.refresh();
      }
    },
  });
  // [SCOPE 042 / T021] END

  // [SCOPE 042 / T020] BEGIN — light poll fallback (visible-only, change-gated)
  const pollTimer = setInterval(() => {
    if (treeView.visible) {
      void treeProvider.poll();
    }
  }, POLL_INTERVAL_MS);
  // [SCOPE 042 / T020] END

  context.subscriptions.push(
    treeView,
    uriHandler,
    { dispose: () => clearInterval(pollTimer) },

    // [SCOPE 058 / T013] register the scope claim decoration provider
    vscode.window.registerFileDecorationProvider(claimProvider),

    // [SCOPE 058 / T010] scope check-out / check-in (refresh re-queries claim state)
    vscode.commands.registerCommand('wxkanban.cockpit.checkoutScope', (node?: CockpitNode) =>
      checkoutScope(context.secrets, node, () => treeProvider.refresh()),
    ),
    vscode.commands.registerCommand('wxkanban.cockpit.checkinScope', (node?: CockpitNode) =>
      checkinScope(context.secrets, node, () => treeProvider.refresh()),
    ),

    vscode.commands.registerCommand('wxkanban.cockpit.refresh', () => treeProvider.refresh()),

    // [SCOPE 060 / Cockpit] Copy _wxAI/commands/ → .claude/commands/ so the kit's
    // slash commands work in Claude Code. Idempotent; reports what changed.
    vscode.commands.registerCommand('wxkanban.cockpit.installCommands', () => {
      const r = installCommands();
      if (!r.ok) {
        void vscode.window.showWarningMessage(`wxKanban: ${r.error}`);
        return;
      }
      const changed = r.installed.length + r.updated.length;
      void vscode.window.showInformationMessage(
        changed
          ? `wxKanban: ${r.installed.length} installed, ${r.updated.length} updated in .claude/commands/. Reload to pick up new / commands.`
          : 'wxKanban: slash commands already up to date.',
      );
      treeProvider.refresh();
    }),

    // [SCOPE 019 / R15] Apply a pending kit update in a terminal (notify + confirm).
    // The kit's ensureKitUpToDate() writes .wxai/kit-update-check.json; the Cockpit
    // shows a click-to-install row, and this command runs the from-server upgrade.
    vscode.commands.registerCommand('wxkanban.cockpit.upgradeKit', () => {
      const s = checkKitUpdate();
      if (!s.root) {
        void vscode.window.showWarningMessage('wxKanban: no kit project folder is open.');
        return;
      }
      runKitUpgrade(s.root);
    }),

    // [SCOPE 083 / T010] Re-run the version check in the open when
    // the cached one failed. The cache records that a check could not run; this
    // is how the operator finds out WHY, with the error on screen instead of
    // swallowed into a best-effort silence.
    vscode.commands.registerCommand('wxkanban.cockpit.recheckKit', () => {
      const s = checkKitUpdate();
      if (!s.root) {
        void vscode.window.showWarningMessage('wxKanban: no kit project folder is open.');
        return;
      }
      runKitVersionCheck(s.root);
    }),

    // [SCOPE 083 / T008] Establish a kit in a folder that has none: prompt for
    // project + token, download the release, unpack it and run the existing
    // scripts/init.mjs. Also reachable from the "No kit installed" tree row.
    vscode.commands.registerCommand('wxkanban.cockpit.installKit', async () => {
      await bootstrapKit(context);
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand('wxkanban.cockpit.openDetail', (arg?: { task: CockpitTask; scope: CockpitScope }) => {
      if (arg?.task && arg?.scope) {
        showTaskDetail(arg.task, arg.scope);
      }
    }),

    vscode.commands.registerCommand('wxkanban.cockpit.openSpec', (node?: CockpitNode) => {
      const specNumber = node?.scope?.specNumber;
      if (specNumber) {
        void openRelatedSpec(specNumber);
      } else {
        void vscode.window.showInformationMessage('wxKanban: select a scope to open its spec/file.');
      }
    }),

    // [SCOPE 043 / T004] BEGIN — feedback commands
    vscode.commands.registerCommand('wxkanban.cockpit.submitFeedback', () => openFeedbackPanel(context.secrets)),
    vscode.commands.registerCommand('wxkanban.cockpit.myFeedback', () => myFeedback(context.secrets)),
    // [SCOPE 043 / T004] END

    // [SCOPE 079 / T05] BEGIN — Community Help chat
    // [SCOPE 079 / FR-008] The consumer-credential commands were removed with
    // Amendment C — the wxKanban server now brokers the session, so there is no
    // client-side secret to set or clear; a new user is only prompted for email.
    vscode.commands.registerCommand('wxkanban.cockpit.openChat', () => openChatPanel(context.secrets)),
    // [SCOPE 079 / T05] END

    // [SCOPE 141 / T027] BEGIN — open the wxKanban Manual in the browser (FR-017)
    vscode.commands.registerCommand('wxkanban.cockpit.openManual', () => openManual()),
    // [SCOPE 141 / T027] END

    // [SCOPE 104 / Cockpit] BEGIN — opt-in wxLight/wxDark recording-theme toggle.
    // The two themes ship self-contained via contributes.themes. They are applied
    // ONLY by the VS Code theme picker or this command — the cockpit never sets
    // workbench.colorTheme on its own (no auto-apply on activate/session start).
    // Flips wxLight<->wxDark; from any other active theme it selects wxDark.
    // Written at Global scope so the recording look follows the user everywhere.
    // No keybinding is contributed; F9 is documented in the README as a user opt-in.
    vscode.commands.registerCommand('wxkanban.cockpit.toggleTheme', async () => {
      const cfg = vscode.workspace.getConfiguration('workbench');
      const current = cfg.get<string>('colorTheme');
      const next = current === 'wxDark' ? 'wxLight' : 'wxDark';
      await cfg.update('colorTheme', next, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(`wxKanban: recording theme set to ${next}.`);
    }),
    // [SCOPE 104 / Cockpit] END

    // [SCOPE 043 / T010] answer a needs-info item clicked in the cockpit tree
    vscode.commands.registerCommand('wxkanban.cockpit.answerFeedback', (item?: MyFeedbackItem) => {
      if (item) void answerFeedbackItem(context.secrets, item);
    }),

    // [SCOPE 043 / T011] open the read-only detail view for a submitted item
    vscode.commands.registerCommand('wxkanban.cockpit.showFeedbackDetail', (arg?: unknown) => {
      const item = feedbackItemFrom(arg); // [SCOPE 043 / T033] context menu passes the node
      if (item) showFeedbackDetail(item);
    }),

    // [SCOPE 043 / T011b] push a feedback item's full text into the Claude chat.
    // [SCOPE 043 / T034] It no longer marks the item triaged (FR-030).
    vscode.commands.registerCommand('wxkanban.cockpit.pushFeedbackToChat', (arg?: unknown) => {
      const item = feedbackItemFrom(arg); // [SCOPE 043 / T033] inline button passes the node
      if (item) void pushFeedbackToChat(item);
    }),

    // [SCOPE 042 / Help] open a command's doc from the Help section, or show its
    // excerpt if the doc can't be opened. Read-only.
    vscode.commands.registerCommand('wxkanban.cockpit.openCommandHelp', async (cmd?: HelpCommand) => {
      if (!cmd) return;
      if (cmd.docPath) {
        try {
          await vscode.window.showTextDocument(vscode.Uri.file(cmd.docPath));
          return;
        } catch {
          /* fall through to the info message */
        }
      }
      void vscode.window.showInformationMessage(`/${cmd.name} — ${cmd.blurb || 'no description available'}`);
    }),

    // [SCOPE 042 / Videos] open a docs how-to video page in the external browser.
    vscode.commands.registerCommand('wxkanban.cockpit.openVideo', (v?: DocVideo) => {
      if (v?.pageUrl) void vscode.env.openExternal(vscode.Uri.parse(v.pageUrl));
    }),

    // [SCOPE 066 / Guides] download a migration guide — opens the published PDF
    // URL in the external browser, which is what a download is on every platform.
    vscode.commands.registerCommand('wxkanban.cockpit.openGuide', (g?: GuideVariant) => {
      if (g?.fileUrl) void vscode.env.openExternal(vscode.Uri.parse(g.fileUrl));
    }),

    // [SCOPE 066 / T008] read a FAQ answer (modal); offer its video if present.
    vscode.commands.registerCommand('wxkanban.cockpit.openFaq', async (f?: FaqEntry) => {
      if (!f) return;
      const actions = f.videoUrl ? ['Watch video'] : [];
      const pick = await vscode.window.showInformationMessage(
        f.question,
        { modal: true, detail: f.answer },
        ...actions,
      );
      if (pick === 'Watch video' && f.videoUrl) {
        void vscode.env.openExternal(vscode.Uri.parse(f.videoUrl));
      }
    }),

    // [SCOPE 134 / T033] Start / stop the kit's project agent (SCOPE-132 FR-030, FR-034).
    vscode.commands.registerCommand('wxkanban.cockpit.startProjectAgent', () => {
      const ctx = resolveProjectContext((vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath));
      if (!ctx) {
        void vscode.window.showWarningMessage('wxKanban: open a project folder (with .wxkanban-project.json) first.');
        return;
      }
      if (projectAgent.start(ctx.projectRoot)) {
        void vscode.window.showInformationMessage('wxKanban: project agent starting — it will join the project room.', 'Show output')
          .then((pick) => {
            if (pick === 'Show output') projectAgent.showOutput();
          });
      }
    }),
    vscode.commands.registerCommand('wxkanban.cockpit.stopProjectAgent', () => {
      if (!projectAgent.stop()) void vscode.window.showInformationMessage('wxKanban: the project agent is not running.');
    }),
    vscode.commands.registerCommand('wxkanban.cockpit.showProjectAgentOutput', () => projectAgent.showOutput()),

    vscode.commands.registerCommand('wxkanban.cockpit.signIn', async () => {
      const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
      const ctx = resolveProjectContext(folders);
      if (!ctx) {
        void vscode.window.showWarningMessage('wxKanban: open a project folder (with .wxkanban-project.json) before signing in.');
        return;
      }
      const token = await vscode.window.showInputBox({
        title: 'wxKanban API token',
        prompt: `Paste a project-scoped wxKanban API token for project ${ctx.projectId}`,
        password: true,
        ignoreFocusOut: true,
      });
      if (token && token.trim()) {
        await storeToken(context.secrets, ctx.projectId, token.trim());
        treeProvider.refresh();
        void vscode.window.showInformationMessage('wxKanban: token saved.');
      }
    }),
  );
}
// [SCOPE 042 / T009] END

// [SCOPE 042 / T009] BEGIN — extension deactivation
export function deactivate(): void {
  // Subscriptions are auto-disposed by VS Code.
}
// [SCOPE 042 / T009] END
