// [SCOPE 058 / T013] BEGIN — scope claim visuals + editor read-only.
// [SCOPE 058 / T022] MODIFIED-BY — FR-008 editor read-only sync (syncReadonly).
// A FileDecorationProvider colors/badges scope tree nodes by claim state (keyed
// by a synthetic wxkanban-scope://<specNumber> resourceUri), distinguishing
// claimed-by-me / claimed-by-others / free. The same update also drives the
// FR-008 editor read-only: in a multi-member project a scope's spec docs are
// read-only unless the viewer holds the claim (via files.readonly* settings).
import * as vscode from 'vscode';
import type { CockpitSummary } from '../types.js';
import { computeReadonlyConfig } from './readonlyConfig.js';

const SCHEME = 'wxkanban-scope';

export function scopeResourceUri(specNumber: string): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}://${specNumber}`);
}

interface Claim {
  byMe: boolean;
  name: string;
}

export class ScopeClaimProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  private claims = new Map<string, Claim>();

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== SCHEME) return undefined;
    const claim = this.claims.get(uri.authority);
    if (!claim) return undefined;
    return claim.byMe
      ? { badge: '✎', color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'), tooltip: `Checked out by you` }
      : { badge: '🔒', color: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'), tooltip: `Checked out by ${claim.name}` };
  }

  // Rebuild claim state from a fresh summary and repaint; then sync editor read-only.
  update(summary: CockpitSummary | null): void {
    this.claims.clear();
    const viewer = summary?.viewerUserId ?? null;
    const claimsEnabled = summary?.claimsEnabled ?? true;
    const heldByMe: string[] = [];
    if (summary && claimsEnabled) {
      for (const s of summary.scopes) {
        if (!s.claimedBy) continue;
        const byMe = !!viewer && s.claimedBy.userId === viewer;
        this.claims.set(s.specNumber, { byMe, name: s.claimedBy.name });
        if (byMe) heldByMe.push(s.specNumber);
      }
    }
    this._onDidChange.fire(undefined); // re-query all displayed scope nodes
    void this.syncReadonly(claimsEnabled, heldByMe);
  }

  // [SCOPE 058 / T022] FR-008 — a scope's spec docs are read-only unless the viewer
  // holds it. Editor-level only (files.readonly*), merges with the user's own globs,
  // and is fully disabled (our keys removed) in single-member / claims-off projects.
  private async syncReadonly(claimsEnabled: boolean, heldByMe: string[]): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('files');
    const { include, exclude } = computeReadonlyConfig(
      claimsEnabled,
      heldByMe,
      cfg.get<Record<string, boolean>>('readonlyInclude') ?? {},
      cfg.get<Record<string, boolean>>('readonlyExclude') ?? {},
    );
    await cfg.update('readonlyInclude', include, vscode.ConfigurationTarget.Workspace);
    await cfg.update('readonlyExclude', exclude, vscode.ConfigurationTarget.Workspace);
  }
}
// [SCOPE 058 / T013] END
