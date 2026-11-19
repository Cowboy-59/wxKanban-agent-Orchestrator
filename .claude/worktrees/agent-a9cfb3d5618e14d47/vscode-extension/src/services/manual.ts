import * as vscode from 'vscode';

// [SCOPE 141 / T027] BEGIN — Open the wxKanban Manual (FR-017)
// The Manual's Customer edition is served by the app at /manual/. Resolve the app the same way
// the kit download does (kitUpdate.ts resolveApiUrl): env override, then the wxkanban.cockpit.apiUrl
// setting, then the hosted default, so a Cockpit pointed at another environment opens that Manual.
export function manualUrl(): string {
  const configured = vscode.workspace.getConfiguration('wxkanban.cockpit').get<string>('apiUrl');
  const base = (process.env['WXKANBAN_API_URL'] || (configured && configured.trim()) || 'https://wxkanban.wxperts.com').replace(/\/+$/, '');
  return `${base}/manual/`;
}

export async function openManual(): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(manualUrl()));
}
// [SCOPE 141 / T027] END
