// SPEC-145 (SCOPE-132 Amendment B) — the pure half of remote auto-start, kept free of the
// `vscode` API so it is tested in plain Node: asking the server whether the project allows
// remote (FR-004), deciding whether to start (FR-001), reading the agent's fixed output lines
// (FR-005), and the plain words each failure is shown in.

// [SCOPE 145 / T007] BEGIN — remote settings and the start decision (FR-001, FR-004)
export type RemoteSettingsResult =
  | { kind: 'ok'; allowRemote: boolean; projectName: string }
  | { kind: 'unauthorized' }
  | { kind: 'unreachable'; detail: string };

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** GET /api/project-agent/settings with the project's kit token. Never throws. */
export async function fetchRemoteSettings(
  appBaseUrl: string,
  token: string,
  fetcher: Fetcher = fetch,
): Promise<RemoteSettingsResult> {
  try {
    const res = await fetcher(`${appBaseUrl.replace(/\/+$/, '')}/api/project-agent/settings`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return { kind: 'unauthorized' };
    if (!res.ok) return { kind: 'unreachable', detail: `HTTP ${res.status}` };
    const body = (await res.json()) as { allowRemote?: unknown; projectName?: unknown };
    if (typeof body.allowRemote !== 'boolean') return { kind: 'unreachable', detail: 'unexpected response' };
    return { kind: 'ok', allowRemote: body.allowRemote, projectName: typeof body.projectName === 'string' ? body.projectName : '' };
  } catch (err) {
    return { kind: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Why the remote is off. Shown in the status bar, never as a pop-up. */
export type OffReason = 'not_allowed' | 'switched_off' | 'no_token' | 'unauthorized' | 'unreachable';

/**
 * Start on open only when the developer has not switched it off AND the server says the
 * project allows remote. The developer's switch is checked first, so an opted-out developer
 * makes no server call at all.
 */
export function decideAutoStart(
  autoStart: boolean,
  settings: RemoteSettingsResult | null,
): { start: true } | { start: false; reason: OffReason } {
  if (!autoStart) return { start: false, reason: 'switched_off' };
  if (!settings) return { start: false, reason: 'no_token' };
  if (settings.kind === 'unauthorized') return { start: false, reason: 'unauthorized' };
  if (settings.kind === 'unreachable') return { start: false, reason: 'unreachable' };
  return settings.allowRemote ? { start: true } : { start: false, reason: 'not_allowed' };
}

export function offReasonText(reason: OffReason): string {
  switch (reason) {
    case 'not_allowed':
      return 'Remote is not allowed for this project.';
    case 'switched_off':
      return 'Auto-start is switched off (wxkanban.projectAgent.autoStart).';
    case 'no_token':
      return 'This project has no API token yet. Connect the project (kit-configure).';
    case 'unauthorized':
      return "The project's API token was not accepted. Reconnect the project (kit-configure).";
    case 'unreachable':
      return 'The wxKanban server could not be reached.';
  }
}
// [SCOPE 145 / T007] END

// [SCOPE 145 / T008] BEGIN — the agent's fixed output lines and the failure words (FR-005)
export type AgentLine = { type: 'ready' } | { type: 'refused'; code: string };

/** The two lines the kit's bridge prints for the Cockpit (SPEC-145 T006). Anything else: null. */
export function parseAgentLine(line: string): AgentLine | null {
  const text = line.trim();
  if (/^\[bridge\] ready project=/.test(text)) return { type: 'ready' };
  const refused = /^\[project-agent\] refused ([A-Za-z0-9_-]{1,64})$/.exec(text);
  if (refused) return { type: 'refused', code: refused[1] };
  return null;
}

/** The cause and the next step, in plain words, for each way the remote fails to come up. */
export function failureText(code: string): string {
  switch (code) {
    case 'remote_not_allowed':
      return "Remote is not allowed for this project. A company ADMIN or the project's TEAM_MANAGER can turn on Allow remote in the project's Kit tab.";
    case 'no_company_account':
      return 'This company has no YappChatt account yet. Ask an ADMIN to link the company YappChatt account on the Company page.';
    case 'worktree_locked':
      return 'Another session is running on this folder. Stop it first, then start the project agent again.';
    case 'unreachable':
      return 'The wxKanban server could not be reached. Check the connection and start the project agent again.';
    case 'timeout':
      return 'The project agent did not report that it is connected. Open the output for details.';
    case 'exited':
      return 'The project agent stopped before it connected. Open the output for details.';
    default:
      return `The project agent could not start (${code}). Open the output for details.`;
  }
}

/** Splits a byte stream into whole lines, holding a partial last line until it completes. */
export class LineSplitter {
  private pending = '';

  push(chunk: string): string[] {
    const text = this.pending + chunk;
    const parts = text.split(/\r?\n/);
    this.pending = parts.pop() ?? '';
    return parts;
  }
}
// [SCOPE 145 / T008] END
