import * as os from 'os';
import * as vscode from 'vscode';
import { resolveProjectContext, type ProjectContext } from '../services/projectContext.js';
import { resolveToken } from '../services/auth.js';
import { CockpitMcpClient } from '../services/mcpClient.js';
import type { MyFeedbackItem } from '../types.js';

// [SCOPE 043 / T004] BEGIN — persona-led capture (Bug Reporter / Feature Suggester)
// Static, one-question-at-a-time interview — the buildscope-style guided capture
// that always works with no editor AI present (the spec's guaranteed fallback;
// an editor-AI-driven dynamic interview via vscode.lm is a future enhancement).
// The kit is a workflow engine, not an AI client — this command calls no
// kit-internal AI; it just collects the structured result and submits it.
export interface PersonaQuestion {
  key: string;
  prompt: string;
  placeHolder?: string;
}

export const BUG_PERSONA: PersonaQuestion[] = [
  { key: 'doing', prompt: 'What were you doing when the problem happened?' },
  { key: 'expected', prompt: 'What did you expect to happen?' },
  { key: 'actual', prompt: 'What actually happened?' },
  { key: 'repro', prompt: 'How can we reproduce it? (steps)' },
  { key: 'frequency', prompt: 'How often does it happen? (always / sometimes / once)' },
  { key: 'impact', prompt: 'How does it affect your work?' },
];

export const SUGGESTION_PERSONA: PersonaQuestion[] = [
  { key: 'problem', prompt: 'What problem or pain are you trying to solve?' },
  { key: 'who', prompt: 'Who feels this problem?' },
  { key: 'workaround', prompt: 'How do you handle it today? (any workaround)' },
  { key: 'desired', prompt: 'What would the ideal outcome look like?' },
  { key: 'why', prompt: 'Why does this matter / what value would it add?' },
];

export function captureContext(ctx: ProjectContext): Record<string, unknown> {
  const ext = vscode.extensions.getExtension('wxperts.wxkanban-dev-cockpit');
  return {
    extensionversion: (ext?.packageJSON as { version?: string } | undefined)?.version ?? null,
    activescope: ctx.activeScope ?? null,
    lifecyclestage: ctx.lifecycleStage ?? null,
    vscodeversion: vscode.version,
    os: `${os.platform()} ${os.release()}`,
  };
}
// [SCOPE 043 / T004] END

// [SCOPE 043 / T004] BEGIN — resolveClient (shared project + token + client wiring)
export async function resolveClient(
  secrets: vscode.SecretStorage,
): Promise<{ ctx: ProjectContext; client: CockpitMcpClient } | null> {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const ctx = resolveProjectContext(folders);
  if (!ctx) {
    void vscode.window.showWarningMessage(
      'wxKanban: open a project folder (with .wxkanban-project.json) first.',
    );
    return null;
  }
  const token = await resolveToken(secrets, ctx.projectRoot, ctx.projectId);
  if (!token) {
    void vscode.window.showWarningMessage('wxKanban: sign in first (run "wxKanban: Sign In / Relink Project").');
    return null;
  }
  return { ctx, client: new CockpitMcpClient({ baseUrl: ctx.mcpBaseUrl, token }) };
}
// [SCOPE 043 / T004] END

// [SCOPE 043 / T009] submitFeedback's InputBox chain was replaced by the
// two-mode webview panel (providers/feedbackPanel.ts). The cockpit command now
// opens that panel. BUG_PERSONA / SUGGESTION_PERSONA / captureContext are
// re-exported above for the panel's Guided mode.

// [SCOPE 043 / T004] BEGIN — myFeedback command (status list + needs-info reply; T007 cockpit UI)
export async function myFeedback(secrets: vscode.SecretStorage): Promise<void> {
  const resolved = await resolveClient(secrets);
  if (!resolved) return;
  const { ctx, client } = resolved;

  let items: MyFeedbackItem[];
  try {
    const res = await client.callTool<{ items: MyFeedbackItem[] }>('project.list_my_feedback', {
      projectId: ctx.projectId,
    });
    items = res.items ?? [];
  } catch (err) {
    void vscode.window.showErrorMessage(`wxKanban: could not load your feedback — ${(err as Error).message}`);
    return;
  }
  if (items.length === 0) {
    void vscode.window.showInformationMessage('wxKanban: you have no feedback submissions yet.');
    return;
  }

  const pick = await vscode.window.showQuickPick(
    items.map((it) => {
      const flag = it.status === 'needsinfo' ? '$(question) ' : it.duplicateOfId ? '$(copy) ' : '';
      const dup = it.duplicateOfId ? ' — already received (linked to an existing report)' : '';
      return {
        label: `${flag}[${it.status}] ${it.title}`,
        description: `${it.type}${it.severity ? ` · ${it.severity}` : ''} · ${it.referenceId.slice(0, 8)}`,
        detail:
          it.status === 'needsinfo' && it.clarificationQuestion
            ? `Needs more info: ${it.clarificationQuestion}`
            : it.status === 'declined' && it.declineReason
              ? `Declined: ${it.declineReason}`
              : dup || undefined,
        item: it,
      };
    }),
    { title: 'My wxKanban Feedback', placeHolder: 'Select an item (needs-info items can be answered)' },
  );
  if (!pick) return;
  const item = pick.item;

  if (item.status !== 'needsinfo' || !item.clarificationQuestion) {
    return; // viewing only
  }

  const answer = await vscode.window.showInputBox({
    title: `Answer — ${item.title}`,
    prompt: item.clarificationQuestion,
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() ? undefined : 'An answer is required'),
  });
  if (!answer) return;

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'wxKanban: sending your answer…' },
      () =>
        client.callTool('project.answer_feedback', {
          projectId: ctx.projectId,
          feedbackId: item.id,
          answer: answer.trim(),
        }),
    );
    void vscode.window.showInformationMessage('wxKanban: thanks — your answer was sent.');
  } catch (err) {
    void vscode.window.showErrorMessage(`wxKanban: could not send your answer — ${(err as Error).message}`);
  }
}
// [SCOPE 043 / T004] END

// [SCOPE 043 / T010] BEGIN — answer a specific needs-info item (from the cockpit tree)
export async function answerFeedbackItem(
  secrets: vscode.SecretStorage,
  item: MyFeedbackItem,
): Promise<void> {
  if (item.status !== 'needsinfo' || !item.clarificationQuestion) {
    void vscode.window.showInformationMessage('wxKanban: this report is not awaiting more info.');
    return;
  }
  const resolved = await resolveClient(secrets);
  if (!resolved) return;
  const { ctx, client } = resolved;

  const answer = await vscode.window.showInputBox({
    title: `Answer — ${item.title}`,
    prompt: item.clarificationQuestion,
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() ? undefined : 'An answer is required'),
  });
  if (!answer) return;

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'wxKanban: sending your answer…' },
      () =>
        client.callTool('project.answer_feedback', {
          projectId: ctx.projectId,
          feedbackId: item.id,
          answer: answer.trim(),
        }),
    );
    void vscode.window.showInformationMessage('wxKanban: thanks — your answer was sent.');
    void vscode.commands.executeCommand('wxkanban.cockpit.refresh');
  } catch (err) {
    void vscode.window.showErrorMessage(`wxKanban: could not send your answer — ${(err as Error).message}`);
  }
}
// [SCOPE 043 / T010] END

// [SCOPE 043 / T011b] BEGIN — push a feedback item into the Claude chat + mark it triaged
// Clicking a (non-needs-info) feedback item assembles its full text (the body the
// submitter entered + auto-captured context) into a prompt and pushes it into the
// Claude Code chat via the documented URI handler, then flags the item 'triaged'
// (best-effort) so the cockpit reflects that it's being worked on.
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function recordToText(rec: Record<string, unknown> | null): string {
  if (!rec || typeof rec !== 'object') return '_(nothing recorded)_';
  const lines = Object.entries(rec)
    .filter(([, v]) => v !== null && v !== undefined && `${v}`.trim() !== '')
    .map(([k, v]) => `- **${humanizeKey(k)}:** ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return lines.length ? lines.join('\n') : '_(nothing recorded)_';
}

export async function pushFeedbackToChat(
  secrets: vscode.SecretStorage,
  item: MyFeedbackItem,
): Promise<void> {
  const meta = [
    `**Type:** ${item.type}`,
    `**Status:** triaged (was ${item.status})`,
    item.severity ? `**Severity:** ${item.severity}` : '',
    `**Reference:** ${item.referenceId}`,
  ].filter(Boolean).join(' · ');

  const notes: string[] = [];
  if (item.duplicateOfId) notes.push('> Already received — linked to an existing report.');
  if (item.clarificationQuestion) notes.push(`> wxperts asked: ${item.clarificationQuestion}`);
  if (item.clarificationAnswer) notes.push(`> Your reply: ${item.clarificationAnswer}`);
  if (item.declineReason) notes.push(`> Declined: ${item.declineReason}`);

  const prompt = [
    `# wxKanban feedback: ${item.title}`,
    meta,
    notes.length ? notes.join('\n') : '',
    '',
    '## What I reported',
    recordToText(item.details),
    '',
    '## Captured context',
    recordToText(item.context),
    '',
    '---',
    `Please help me address this wxKanban feedback (ref ${item.referenceId}).`,
  ].join('\n');

  // Push into the Claude Code chat (opens/focuses a Claude tab and pre-fills the prompt).
  const uri = vscode.Uri.parse(
    `vscode://anthropic.claude-code/open?prompt=${encodeURIComponent(prompt)}`,
  );
  try {
    await vscode.env.openExternal(uri);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `wxKanban: could not open the Claude chat — ${(err as Error).message}. ` +
        `Open the detail view and copy the text instead.`,
    );
    return;
  }

  // Mark the item triaged (best-effort) and refresh the tree so the status updates.
  const resolved = await resolveClient(secrets);
  if (!resolved) return;
  try {
    await resolved.client.callTool('project.triage_feedback', {
      projectId: resolved.ctx.projectId,
      feedbackId: item.id,
    });
    void vscode.commands.executeCommand('wxkanban.cockpit.refresh');
  } catch (err) {
    void vscode.window.showWarningMessage(
      `wxKanban: pushed to chat, but couldn't mark it triaged — ${(err as Error).message}`,
    );
  }
}
// [SCOPE 043 / T011b] END
