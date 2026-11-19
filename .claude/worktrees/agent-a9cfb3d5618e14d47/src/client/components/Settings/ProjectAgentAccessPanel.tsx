/**
 * Per-project agent access — the checkbox that bounds an agent. SCOPE-134 / T027.
 *
 * A Company Access Token lets an agent CONNECT. This decides what it may REACH. The two
 * are deliberately separate surfaces: issuing a credential is a company decision, and
 * allowing it into a particular project is a project one.
 *
 * Unticking takes effect on the agent's next call, not at its next session — the grant is
 * re-read every time. The copy says so, because a control that looks immediate and is not
 * is worse than one that admits a delay.
 *
 * SPEC-145 (SCOPE-132 Amendment B) adds "Allow remote" at the top: whether this project's
 * agent (the remote) may start at all. The server decides who may change it and enforces it.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Bot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { Label } from "../ui/Label";
import { Switch } from "../ui/Switch";

// [SCOPE 145 / T005] BEGIN — "Allow remote" request helper (FR-002)
export type RemoteAccessFetcher = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * PUT /api/projects/:projectId/remote-access. Returns null on success, or the server's own
 * message (the 403 names who may change it) so the panel shows it as-is.
 */
export async function putAllowRemote(
  projectId: string,
  allowRemote: boolean,
  fetcher: RemoteAccessFetcher = fetch,
): Promise<string | null> {
  const res = await fetcher(`/api/projects/${projectId}/remote-access`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ allowRemote }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return body.message ?? body.error ?? "could not change Allow remote";
}
// [SCOPE 145 / T005] END

// [SCOPE 154 / T002] BEGIN — Autopilot switch request helper (FR-001)
/**
 * PUT /api/projects/:projectId/autopilot. Returns null on success, or the server's own
 * message (release-gate-closed, Allow-remote-off, or who may change it) as-is.
 */
export async function putAutopilot(
  projectId: string,
  autopilotEnabled: boolean,
  fetcher: RemoteAccessFetcher = fetch,
): Promise<string | null> {
  const res = await fetcher(`/api/projects/${projectId}/autopilot`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ autopilotEnabled }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return body.message ?? body.error ?? "could not change Autopilot";
}
// [SCOPE 154 / T002] END

// [SCOPE 134 / T027] BEGIN — ProjectAgentAccessPanel
// MODIFIED-BY: [SCOPE 145 / T005] — "Allow remote" switch, enabled only when the server says canManageRemote
// MODIFIED-BY: [SCOPE 152 / T008, T010] — the K.A.I.N. tick is retired; a read-only "Reachable by" line instead
// MODIFIED-BY: [SCOPE 154 / T002] — Autopilot switch, below Allow remote, same canManage rule
interface Props {
  projectId: string;
  isAdmin: boolean;
}

export function ProjectAgentAccessPanel({ projectId }: Props) {
  const [allowRemote, setAllowRemote] = useState(false);
  const [canManageRemote, setCanManageRemote] = useState(false);
  const [reachableBy, setReachableBy] = useState<string[]>([]);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotBusy, setAutopilotBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/projects/${projectId}/agent-access`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { credentials: "include" });
      if (!res.ok) throw new Error("could not read agent access");
      const data = (await res.json()) as {
        allowRemote?: boolean;
        canManageRemote?: boolean;
        reachableBy?: string[];
        autopilotEnabled?: boolean;
      };
      setAllowRemote(data.allowRemote === true);
      setCanManageRemote(data.canManageRemote === true);
      setReachableBy(data.reachableBy ?? []);
      setAutopilotEnabled(data.autopilotEnabled === true);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // SPEC-145: re-read from the server, never flip locally — the server is the authority.
  const toggleRemote = async (next: boolean): Promise<void> => {
    setRemoteBusy(true);
    setError(null);
    try {
      const refused = await putAllowRemote(projectId, next);
      if (refused) throw new Error(refused);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemoteBusy(false);
    }
  };

  // SPEC-154: same re-read-from-server discipline as Allow remote.
  const toggleAutopilot = async (next: boolean): Promise<void> => {
    setAutopilotBusy(true);
    setError(null);
    try {
      const refused = await putAutopilot(projectId, next);
      if (refused) throw new Error(refused);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAutopilotBusy(false);
    }
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Agent Access
        </CardTitle>
        <CardDescription className="text-slate-400">
          K.A.I.N. signs in as a person and reaches what that person may reach: your team, and
          consultants your engagements assign to this project. Turning Allow remote off stops it
          on its next request, including work already in progress.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && <div className="p-3 rounded-lg bg-red-900/50 text-red-200 text-sm">{error}</div>}

        {!loading && (
          <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700">
            <div className="min-w-0">
              <Label htmlFor={`allow-remote-${projectId}`} className="text-white text-sm font-medium">
                Allow remote
              </Label>
              <p className="text-slate-400 text-xs mt-1">
                Lets this project&apos;s agent start the remote automatically when someone opens the
                project in VS Code. While it is off, the agent cannot start at all.
              </p>
              {!canManageRemote && (
                <p className="text-slate-500 text-xs mt-1">
                  Only a company ADMIN or this project&apos;s TEAM_MANAGER can change this.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {remoteBusy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              <Switch
                id={`allow-remote-${projectId}`}
                checked={allowRemote}
                disabled={!canManageRemote || remoteBusy}
                onCheckedChange={(next: boolean) => void toggleRemote(next)}
                aria-label="Allow remote"
              />
            </div>
          </div>
        )}

        {/* [SCOPE 154 / T002] BEGIN — Autopilot switch (FR-001) */}
        {!loading && (
          <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700">
            <div className="min-w-0">
              <Label htmlFor={`autopilot-${projectId}`} className="text-white text-sm font-medium">
                Autopilot
              </Label>
              <p className="text-slate-400 text-xs mt-1">
                Lets this project&apos;s agent work the dev plan unattended, scope by scope, posting
                a startup list for your &quot;go&quot; before it starts.
              </p>
              {!canManageRemote && (
                <p className="text-slate-500 text-xs mt-1">
                  Only a company ADMIN or this project&apos;s TEAM_MANAGER can change this.
                </p>
              )}
              {canManageRemote && !allowRemote && (
                <p className="text-slate-500 text-xs mt-1">Turn on Allow remote first.</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {autopilotBusy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              <Switch
                id={`autopilot-${projectId}`}
                checked={autopilotEnabled}
                disabled={!canManageRemote || !allowRemote || autopilotBusy}
                onCheckedChange={(next: boolean) => void toggleAutopilot(next)}
                aria-label="Autopilot"
              />
            </div>
          </div>
        )}
        {/* [SCOPE 154 / T002] END */}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          // SPEC-152 FR-072: who can reach this project. Companies only, never people.
          <p className="text-slate-300 text-sm" data-testid="reachable-by">
            Reachable by: your team
            {reachableBy.length > 0 && (
              <>
                , and consultants of {reachableBy.join(", ")} (engagement)
              </>
            )}
            {!allowRemote && <span className="text-slate-500"> — while Allow remote is on</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
// [SCOPE 134 / T027] END
