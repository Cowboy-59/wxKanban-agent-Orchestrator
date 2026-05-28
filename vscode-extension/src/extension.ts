import * as vscode from 'vscode';
import { CockpitTreeProvider, CockpitNode } from './providers/cockpitTreeProvider.js';
import { showTaskDetail } from './providers/detailPanel.js';
import { openRelatedSpec } from './commands/openSpec.js';
import { storeToken } from './services/auth.js';
import { resolveProjectContext } from './services/projectContext.js';
import type { CockpitScope, CockpitTask } from './types.js';

// Fallback poll cadence — the kit's emitted refresh URI (T021) is the primary,
// immediate signal; this only catches work changed outside this IDE, and only
// fires while the view is visible.
const POLL_INTERVAL_MS = 30_000;

// [SCOPE 042 / T009] BEGIN — extension activation: wire the Dev Cockpit view, detail panel, and commands
export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new CockpitTreeProvider(context.secrets);
  const treeView = vscode.window.createTreeView('wxkanban.cockpit', { treeDataProvider: treeProvider });

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

    vscode.commands.registerCommand('wxkanban.cockpit.refresh', () => treeProvider.refresh()),

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
