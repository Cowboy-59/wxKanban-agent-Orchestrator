import * as vscode from 'vscode';
import { CockpitTreeProvider, CockpitNode } from './providers/cockpitTreeProvider.js';
import { showTaskDetail } from './providers/detailPanel.js';
import { showFeedbackDetail } from './providers/feedbackDetailPanel.js'; // [SCOPE 043 / T011]
import { openRelatedSpec } from './commands/openSpec.js';
import { myFeedback, answerFeedbackItem, pushFeedbackToChat } from './commands/feedback.js'; // [SCOPE 043 / T004, T010, T011b]
import { openFeedbackPanel } from './providers/feedbackPanel.js'; // [SCOPE 043 / T009]
import type { MyFeedbackItem } from './types.js';
import type { HelpCommand } from './services/helpCatalog.js'; // [SCOPE 042 / Help]
import type { DocVideo } from './services/videosCatalog.js'; // [SCOPE 042 / Videos]
import type { FaqEntry } from './services/faqCatalog.js'; // [SCOPE 066 / T008]
import { storeToken } from './services/auth.js';
import { resolveProjectContext } from './services/projectContext.js';
import { materializeStackOnOpen } from './services/materializeStack.js'; // [SCOPE 055]
import { registerScopeDepsWatcher } from './services/scopeDepsWatcher.js'; // [SCOPE 073 / T010]
import { ScopeClaimProvider } from './providers/scopeDecorations.js'; // [SCOPE 058 / T013]
import { checkoutScope, checkinScope } from './commands/scopeCheckout.js'; // [SCOPE 058 / T010]
import { checkCommands, installCommands } from './services/commandsInstall.js'; // [SCOPE 060 / Cockpit]
import { checkKitUpdate, runKitUpgrade } from './services/kitUpdate.js'; // [SCOPE 019 / R15]
import type { CockpitScope, CockpitTask } from './types.js';

// Fallback poll cadence — the kit's emitted refresh URI (T021) is the primary,
// immediate signal; this only catches work changed outside this IDE, and only
// fires while the view is visible.
const POLL_INTERVAL_MS = 30_000;

// [SCOPE 042 / T009] BEGIN — extension activation: wire the Dev Cockpit view, detail panel, and commands
export function activate(context: vscode.ExtensionContext): void {
  // [SCOPE 058 / T013] scope claim decorations + FR-008 editor read-only, fed each
  // refresh by the tree provider's claim sink.
  const claimProvider = new ScopeClaimProvider();
  const treeProvider = new CockpitTreeProvider(context.secrets, (summary) => claimProvider.update(summary));
  const treeView = vscode.window.createTreeView('wxkanban.cockpit', { treeDataProvider: treeProvider });

  // [SCOPE 055] On open, materialize stack.md from the project's ProjectStack doc
  // (DB source of truth). Best-effort and non-destructive; never blocks activation.
  void materializeStackOnOpen(context.secrets);

  // [SCOPE 073 / T010] Editor capture: push scope dependency edges to the scope-flow
  // graph whenever a specs/Project-Scope/*.md is saved. Best-effort; never blocks.
  registerScopeDepsWatcher(context, context.secrets);

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

    // [SCOPE 043 / T010] answer a needs-info item clicked in the cockpit tree
    vscode.commands.registerCommand('wxkanban.cockpit.answerFeedback', (item?: MyFeedbackItem) => {
      if (item) void answerFeedbackItem(context.secrets, item);
    }),

    // [SCOPE 043 / T011] open the read-only detail view for a submitted item
    vscode.commands.registerCommand('wxkanban.cockpit.showFeedbackDetail', (item?: MyFeedbackItem) => {
      if (item) showFeedbackDetail(item);
    }),

    // [SCOPE 043 / T011b] push a feedback item's full text into the Claude chat + mark triaged
    vscode.commands.registerCommand('wxkanban.cockpit.pushFeedbackToChat', (item?: MyFeedbackItem) => {
      if (item) void pushFeedbackToChat(context.secrets, item);
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
