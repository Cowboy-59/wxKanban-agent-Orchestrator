import * as vscode from 'vscode';
import {
  resolveClient,
  captureContext,
  BUG_PERSONA,
  SUGGESTION_PERSONA,
  type PersonaQuestion,
} from '../commands/feedback.js';

// [SCOPE 043 / T009] BEGIN — two-mode feedback webview (Quick paste / Guided interview)
// One panel hosts both capture modes. Quick = paste existing material + a
// provenance line (structuring deferred to AI triage + needs-info). Guided =
// the persona interview, one question at a time with back-navigation and no
// data loss on blur (retainContextWhenHidden). The webview calls no kit-internal
// AI — it gathers the structured result and submits via project.submit_feedback.

let currentPanel: vscode.WebviewPanel | undefined;

interface SubmitMessage {
  type: 'submit';
  payload: {
    feedbackType: 'bug' | 'suggestion';
    mode: 'quick' | 'guided';
    title: string;
    details: Record<string, unknown>;
    notificationChannel: 'inapp' | 'email';
  };
}

export async function openFeedbackPanel(secrets: vscode.SecretStorage): Promise<void> {
  // Fail fast on project/token before opening the panel.
  const resolved = await resolveClient(secrets);
  if (!resolved) return;
  const { ctx, client } = resolved;

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Active);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'wxkanbanFeedback',
    'wxKanban: Report a Bug / Suggest a Feature',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  currentPanel = panel;
  panel.onDidDispose(() => {
    currentPanel = undefined;
  });

  panel.webview.html = getHtml(panel.webview, {
    bug: BUG_PERSONA,
    suggestion: SUGGESTION_PERSONA,
  });

  panel.webview.onDidReceiveMessage(async (msg: SubmitMessage | { type: 'cancel' }) => {
    if (msg.type === 'cancel') {
      panel.dispose();
      return;
    }
    if (msg.type === 'submit') {
      try {
        const res = await client.callTool<{ feedback: { referenceId: string } }>(
          'project.submit_feedback',
          {
            projectId: ctx.projectId,
            type: msg.payload.feedbackType,
            title: msg.payload.title,
            details: { mode: msg.payload.mode, ...msg.payload.details },
            context: captureContext(ctx),
            notificationChannel: msg.payload.notificationChannel,
          },
        );
        await panel.webview.postMessage({
          type: 'result',
          ok: true,
          referenceId: res.feedback.referenceId.slice(0, 8),
        });
        void vscode.commands.executeCommand('wxkanban.cockpit.refresh');
      } catch (err) {
        await panel.webview.postMessage({ type: 'result', ok: false, error: (err as Error).message });
      }
    }
  });
}

function nonceStr(): string {
  // No Math.random dependency concerns here — a webview nonce just needs to be
  // unguessable-enough per load; derive from time + a counter.
  return Buffer.from(`${Date.now()}-${nonceCounter++}`).toString('base64').replace(/=+$/, '');
}
let nonceCounter = 0;

function getHtml(
  webview: vscode.Webview,
  personas: { bug: PersonaQuestion[]; suggestion: PersonaQuestion[] },
): string {
  const nonce = nonceStr();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  const personasJson = JSON.stringify(personas).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px 20px; max-width: 720px; }
  h1 { font-size: 1.2em; margin: 0 0 4px; }
  .sub { color: var(--vscode-descriptionForeground); margin: 0 0 16px; font-size: 0.9em; }
  .row { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .seg button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-contrastBorder, transparent); padding: 6px 14px; cursor: pointer; border-radius: 4px; }
  .seg button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  label { display: block; font-size: 0.85em; color: var(--vscode-descriptionForeground); margin: 12px 0 4px; }
  input[type=text], textarea, select { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder, #8884)); border-radius: 4px; padding: 8px; font-family: inherit; font-size: inherit; }
  textarea { resize: vertical; min-height: 80px; }
  textarea.paste { min-height: 180px; font-family: var(--vscode-editor-font-family); }
  .actions { display: flex; gap: 8px; margin-top: 20px; align-items: center; }
  .actions button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .actions button { border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .actions button:disabled { opacity: 0.5; cursor: default; }
  .progress { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 6px; }
  .q { font-weight: 600; margin-bottom: 6px; }
  .hidden { display: none; }
  .status { margin-top: 16px; padding: 10px; border-radius: 4px; }
  .status.ok { background: var(--vscode-testing-iconPassed, #2a2)22; color: var(--vscode-testing-iconPassed, #3a3); }
  .status.err { background: var(--vscode-inputValidation-errorBackground, #a223); color: var(--vscode-errorForeground); }
  .hint { color: var(--vscode-descriptionForeground); font-size: 0.82em; margin-top: 4px; }
</style>
</head>
<body>
  <h1>Report a Bug / Suggest a Feature</h1>
  <p class="sub">Quick = paste what you've got and fire it off. Guided = we'll walk you through a full report.</p>

  <div class="row seg" id="typeSeg">
    <button data-type="bug" class="active">🐞 Bug</button>
    <button data-type="suggestion">💡 Suggestion</button>
  </div>

  <div class="row seg" id="modeSeg">
    <button data-mode="quick" class="active">⚡ Quick</button>
    <button data-mode="guided">🧭 Guided</button>
  </div>

  <label>Title</label>
  <input type="text" id="title" placeholder="A short summary" />

  <!-- Quick mode -->
  <div id="quick">
    <label>Paste the issue (error, chat excerpt, log, what happened)</label>
    <textarea id="paste" class="paste" placeholder="Paste here…"></textarea>
    <label>Where did this come from? (provenance)</label>
    <input type="text" id="provenance" placeholder="e.g. the build output, a chat with the AI, the timer screen" />
    <label>Anything to add? (optional)</label>
    <input type="text" id="note" placeholder="e.g. WHY did this fail?" />
  </div>

  <!-- Guided mode -->
  <div id="guided" class="hidden">
    <div class="progress" id="gProgress"></div>
    <div class="q" id="gPrompt"></div>
    <textarea id="gAnswer" placeholder="Your answer…"></textarea>
    <div class="actions">
      <button id="gBack">← Back</button>
      <button id="gNext">Next →</button>
    </div>
  </div>

  <label>Notify me of status changes via</label>
  <select id="channel">
    <option value="inapp">In-app (Dev Cockpit)</option>
    <option value="email">In-app + Email</option>
  </select>

  <div class="actions">
    <button class="primary" id="submit">Submit</button>
    <button id="cancel">Cancel</button>
  </div>
  <div class="hint" id="quickHint">Tip: in Quick mode, if we need more detail we'll ask you a follow-up in your "My Feedback" list.</div>

  <div id="status"></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const personas = ${personasJson};
  const state = { type: 'bug', mode: 'quick', gIndex: 0, answers: {} };

  function $(id){ return document.getElementById(id); }
  function persona(){ return personas[state.type] || []; }

  function setSeg(segId, attr, val){
    document.querySelectorAll('#'+segId+' button').forEach(b => b.classList.toggle('active', b.dataset[attr] === val));
  }

  function renderGuided(){
    const qs = persona();
    state.gIndex = Math.max(0, Math.min(state.gIndex, qs.length - 1));
    const q = qs[state.gIndex];
    $('gProgress').textContent = (state.type === 'bug' ? 'Bug Reporter' : 'Feature Suggester') + ' — question ' + (state.gIndex+1) + ' of ' + qs.length;
    $('gPrompt').textContent = q ? q.prompt : '';
    $('gAnswer').value = q ? (state.answers[q.key] || '') : '';
    $('gBack').disabled = state.gIndex === 0;
    $('gNext').disabled = state.gIndex >= qs.length - 1;
    $('gAnswer').focus();
  }

  function saveGuidedAnswer(){
    const qs = persona();
    const q = qs[state.gIndex];
    if (q) state.answers[q.key] = $('gAnswer').value.trim();
  }

  function showMode(){
    $('quick').classList.toggle('hidden', state.mode !== 'quick');
    $('guided').classList.toggle('hidden', state.mode !== 'guided');
    $('quickHint').classList.toggle('hidden', state.mode !== 'quick');
    if (state.mode === 'guided') renderGuided();
  }

  document.querySelectorAll('#typeSeg button').forEach(b => b.addEventListener('click', () => {
    saveGuidedAnswer();
    state.type = b.dataset.type;
    setSeg('typeSeg','type',state.type);
    state.gIndex = 0; state.answers = {};
    if (state.mode === 'guided') renderGuided();
  }));
  document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    setSeg('modeSeg','mode',state.mode);
    showMode();
  }));
  $('gBack').addEventListener('click', () => { saveGuidedAnswer(); state.gIndex--; renderGuided(); });
  $('gNext').addEventListener('click', () => { saveGuidedAnswer(); state.gIndex++; renderGuided(); });

  $('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));

  $('submit').addEventListener('click', () => {
    const title = $('title').value.trim();
    if (!title){ showStatus(false, 'A title is required.'); $('title').focus(); return; }
    let details = {};
    if (state.mode === 'quick'){
      const paste = $('paste').value.trim();
      if (!paste){ showStatus(false, 'Paste the issue (or switch to Guided).'); return; }
      details = { paste, provenance: $('provenance').value.trim(), note: $('note').value.trim() };
    } else {
      saveGuidedAnswer();
      details = Object.assign({}, state.answers);
    }
    $('submit').disabled = true;
    vscode.postMessage({ type: 'submit', payload: {
      feedbackType: state.type, mode: state.mode, title, details,
      notificationChannel: $('channel').value,
    }});
  });

  function showStatus(ok, msg){
    const el = $('status');
    el.className = 'status ' + (ok ? 'ok' : 'err');
    el.textContent = msg;
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'result'){
      $('submit').disabled = false;
      if (m.ok){ showStatus(true, 'Thanks! Submitted (ref ' + m.referenceId + '). Track it in "My Feedback".'); }
      else { showStatus(false, 'Submission failed — ' + m.error); }
    }
  });

  showMode();
</script>
</body>
</html>`;
}
// [SCOPE 043 / T009] END
