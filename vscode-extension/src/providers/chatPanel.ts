import * as vscode from 'vscode';
import { resolveProjectContext } from '../services/projectContext.js';
import { resolveChatCredential, getChatUser, storeChatUser, type ChatUser } from '../services/auth.js';
import { ChatSocket, resolveChatConfig, type ChatMessage, type ChatStatus } from '../services/chatSocket.js';

// [SCOPE 079 / T04] BEGIN — Community Help chat panel (webview + host-owned socket)
// One panel hosts the live wxKanban Community chat. The webview is locked to
// default-src 'none' and never opens the socket or holds any credential — the
// extension host (ChatSocket) owns the YappChat handshake + WebSocket and relays
// frames via postMessage. The webview only ever renders and captures input.

let currentPanel: vscode.WebviewPanel | undefined;
let currentSocket: ChatSocket | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function openChatPanel(secrets: vscode.SecretStorage): Promise<void> {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const ctx = resolveProjectContext(folders);
  if (!ctx) {
    void vscode.window.showWarningMessage('wxKanban: open a project folder (with .wxkanban-project.json) first.');
    return;
  }

  const consumerSecret = await resolveChatCredential(secrets, ctx.projectRoot);
  if (!consumerSecret) {
    const pick = await vscode.window.showWarningMessage(
      'wxKanban: set the community-chat credential first.',
      'Set credential',
    );
    if (pick === 'Set credential') await vscode.commands.executeCommand('wxkanban.cockpit.setChatCredential');
    return;
  }

  const user = await resolveChatUser(secrets);
  if (!user) return;

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Active);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'wxkanbanChat',
    'wxKanban: Community Help',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  currentPanel = panel;
  panel.webview.html = getHtml(panel.webview);

  const post = (m: unknown): void => void panel.webview.postMessage(m);
  const socket = new ChatSocket(resolveChatConfig(), consumerSecret, user, {
    onStatus: (status: ChatStatus, detail?: string) => post({ type: 'status', status, detail }),
    onHistory: (messages: ChatMessage[]) => post({ type: 'history', messages }),
    onMessage: (message: ChatMessage) => post({ type: 'message', message }),
    onTyping: (from: string, typing: boolean) => post({ type: 'typing', from, typing }),
    onError: (message: string) => post({ type: 'error', message }),
  });
  currentSocket = socket;

  panel.webview.onDidReceiveMessage((msg: { type?: string; text?: string }) => {
    if (msg.type === 'ready') {
      // Start only once the webview script is live, so history/status aren't
      // posted into a page that isn't listening yet.
      void socket.start();
    } else if (msg.type === 'send' && typeof msg.text === 'string') {
      void socket.send(msg.text);
    }
  });

  panel.onDidDispose(() => {
    socket.dispose();
    if (currentSocket === socket) currentSocket = undefined;
    currentPanel = undefined;
  });
}

// Resolve (and, first time, capture + cache) the person's YappChat identity. Kept
// deliberately simple: prompt once for email + name, store in SecretStorage. The
// email keys the YappChat user so community posts are attributed to the person.
async function resolveChatUser(secrets: vscode.SecretStorage): Promise<ChatUser | null> {
  const existing = await getChatUser(secrets);
  if (existing) return existing;

  const email = await vscode.window.showInputBox({
    title: 'wxKanban Community — your email',
    prompt: 'Used to identify you in the wxKanban Community chat.',
    ignoreFocusOut: true,
    validateInput: (v) => (EMAIL_RE.test(v.trim()) ? undefined : 'Enter a valid email address'),
  });
  if (!email) return null;

  const displayName = await vscode.window.showInputBox({
    title: 'wxKanban Community — your name',
    prompt: 'How your messages are attributed.',
    ignoreFocusOut: true,
    value: email.trim().split('@')[0],
    validateInput: (v) => (v.trim() ? undefined : 'A name is required'),
  });
  if (!displayName) return null;

  const user: ChatUser = { email: email.trim().toLowerCase(), displayName: displayName.trim() };
  await storeChatUser(secrets, user);
  return user;
}

function nonceStr(): string {
  return Buffer.from(`${Date.now()}-${nonceCounter++}`).toString('base64').replace(/=+$/, '');
}
let nonceCounter = 0;

function getHtml(webview: vscode.Webview): string {
  const nonce = nonceStr();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  html, body { height: 100%; }
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; display: flex; flex-direction: column; }
  header { padding: 10px 16px; border-bottom: 1px solid var(--vscode-panel-border, #8882); }
  header h1 { font-size: 1.05em; margin: 0; }
  #status { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  #status.err { color: var(--vscode-errorForeground); }
  #log { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
  .msg { max-width: 78%; padding: 6px 10px; border-radius: 8px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, #8884); }
  .msg.mine { align-self: flex-end; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .from { font-size: 0.72em; opacity: 0.75; margin-bottom: 2px; }
  .msg.mine .from { display: none; }
  .text { white-space: pre-wrap; word-break: break-word; }
  #typing { font-size: 0.78em; color: var(--vscode-descriptionForeground); padding: 0 16px; height: 1.2em; }
  footer { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--vscode-panel-border, #8882); }
  #input { flex: 1; resize: none; min-height: 20px; max-height: 120px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #8884); border-radius: 4px; padding: 8px; font-family: inherit; font-size: inherit; }
  #send { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 0 16px; cursor: pointer; }
  #send:disabled { opacity: 0.5; cursor: default; }
  .empty { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
</style>
</head>
<body>
  <header>
    <h1>wxKanban Community</h1>
    <div id="status">Connecting…</div>
  </header>
  <div id="log"><div class="empty" id="empty">No messages yet — say hello 👋</div></div>
  <div id="typing"></div>
  <footer>
    <textarea id="input" placeholder="Message the community…  (Enter to send, Shift+Enter for newline)" disabled></textarea>
    <button id="send" disabled>Send</button>
  </footer>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const log = document.getElementById('log');
  const empty = document.getElementById('empty');
  const statusEl = document.getElementById('status');
  const typingEl = document.getElementById('typing');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const seen = new Set();
  let connected = false;

  function setEnabled(on){ connected = on; input.disabled = !on; send.disabled = !on; }

  function appendMessage(m){
    if (m.id && seen.has(m.id)) return;
    if (m.id) seen.add(m.id);
    if (empty) empty.remove();
    const wrap = document.createElement('div');
    wrap.className = 'msg' + (m.mine ? ' mine' : '');
    const from = document.createElement('div');
    from.className = 'from';
    from.textContent = m.from || 'someone';
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = m.text || '';
    wrap.appendChild(from); wrap.appendChild(text);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function doSend(){
    const text = input.value.trim();
    if (!text || !connected) return;
    vscode.postMessage({ type: 'send', text });
    input.value = '';
    input.focus();
  }

  send.addEventListener('click', doSend);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); doSend(); }
  });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'status'){
      const map = { connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…', closed: 'Disconnected', error: 'Connection error' };
      statusEl.textContent = (map[m.status] || m.status) + (m.detail ? ' — ' + m.detail : '');
      statusEl.className = (m.status === 'error') ? 'err' : '';
      setEnabled(m.status === 'connected');
    } else if (m.type === 'history'){
      (m.messages || []).forEach(appendMessage);
    } else if (m.type === 'message'){
      appendMessage(m.message);
    } else if (m.type === 'typing'){
      typingEl.textContent = m.typing ? ((m.from || 'someone') + ' is typing…') : '';
    } else if (m.type === 'error'){
      statusEl.textContent = m.message;
      statusEl.className = 'err';
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
// [SCOPE 079 / T04] END
