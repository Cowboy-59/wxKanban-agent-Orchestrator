import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CockpitMcpClient } from './mcpClient.js';
import { resolveProjectContext } from './projectContext.js';
import { resolveToken } from './auth.js';

// [SCOPE 055] On project open, materialize stack.md from the project's ProjectStack
// document. The Stack & Style is captured in the wxKanban web app at project
// creation and stored in the DB (the source of truth); the hosted server cannot
// write the dev's working tree, so the kit/extension pulls it here.
//
// Non-destructive: only writes when stack.md is ABSENT — it never clobbers local
// edits (use `/buildstack` to update both the file and the DB in sync). Entirely
// best-effort: any failure is swallowed so it can never disrupt activation.
export async function materializeStackOnOpen(secrets: vscode.SecretStorage): Promise<void> {
  try {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const ctx = resolveProjectContext(folders);
    if (!ctx) return;

    const file = path.join(ctx.projectRoot, 'stack.md');
    if (fs.existsSync(file)) return; // never clobber local edits

    const token = await resolveToken(secrets, ctx.projectRoot, ctx.projectId);
    if (!token) return;

    const client = new CockpitMcpClient({ baseUrl: ctx.mcpBaseUrl, token });
    const { stack } = await client.callTool<{ stack: { content: string } | null }>(
      'project.get_stack',
      { projectId: ctx.projectId },
    );
    if (stack?.content) {
      fs.writeFileSync(file, stack.content, 'utf-8');
    }
  } catch {
    /* best-effort — never disrupt activation */
  }
}
