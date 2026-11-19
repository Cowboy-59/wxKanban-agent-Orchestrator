/**
 * Team chat (YappChatt) — the company's own YappChatt account, on the Company page.
 * SPEC-144 / T012 (FR-001, FR-002), contract C3 rows 1-2.
 *
 * GET  /api/company/yappchatt  → connected status for any company user (`canManage` drives the button)
 * POST /api/company/yappchatt  → ADMIN only. `{ confirm: false }` first: which account would be
 *                                linked or created (D5), shown in the confirm dialog. Then
 *                                `{ confirm: true }`: create or link the account
 *
 * A 503 `companion_unavailable` means YappChatt's side is not deployed yet (FR-011). The panel
 * then says so and changes nothing — the server has changed nothing either.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MessagesSquare } from "lucide-react";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { apiFetch } from "../../lib/apiFetch";

// [SCOPE 144 / T012] BEGIN — Team chat panel types and messages (contract C3)
export interface TeamChatStatus {
  connected: boolean;
  /** The linked account's email; null until an account is linked. */
  email: string | null;
  /** The company contact email, which the button uses. */
  contactEmail: string | null;
  yappchattUserId: string | null;
  groupId: string | null;
  linkedAt: string | null;
  canManage: boolean;
}

export interface TeamChatMemberFailure {
  userid: string;
  reason: string;
}

/** C3 names these fields without fixing their type; a count or a list of ids both render. */
export type TeamChatMemberTally = number | string[];

export interface TeamChatMemberSync {
  added: TeamChatMemberTally;
  updated: TeamChatMemberTally;
  removed: TeamChatMemberTally;
  failed: TeamChatMemberFailure[];
}

export interface TeamChatCreateResponse {
  connected: true;
  outcome: "created" | "linked" | "already";
  email: string;
  yappchattUserId: string;
  groupId: string | null;
  members: TeamChatMemberSync;
}

/** D5: the account the button would link (`exists`) or create. */
export interface TeamChatPreview {
  email: string;
  exists: boolean;
  displayName: string | null;
}

export type TeamChatCreateResult =
  | { kind: "ok"; data: TeamChatCreateResponse }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export type TeamChatPreviewResult =
  | { kind: "ok"; data: TeamChatPreview }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export type TeamChatStatusResult =
  | { kind: "ok"; data: TeamChatStatus }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export type TeamChatFetcher = (path: string, init?: RequestInit) => Promise<Response>;

export const TEAM_CHAT_API = "/api/company/yappchatt";
export const TEAM_CHAT_UNAVAILABLE_MESSAGE = "YappChatt isn't ready for this yet — try again later.";
export const TEAM_CHAT_QUERY_KEY = ["company-yappchatt"] as const;
// [SCOPE 144 / T012] END

// [SCOPE 144 / T012] BEGIN — Team chat response readers (GET / POST /api/company/yappchatt)
async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    if (typeof body.error === "string") return body.error;
    if (typeof body.code === "string") return body.code;
    return null;
  } catch {
    return null;
  }
}

function isCompanionUnavailable(status: number, code: string | null): boolean {
  return status === 503 || code === "companion_unavailable";
}

export async function loadTeamChatStatus(fetcher: TeamChatFetcher = apiFetch): Promise<TeamChatStatusResult> {
  const res = await fetcher(TEAM_CHAT_API, { method: "GET" });
  if (!res.ok) {
    const code = await readErrorCode(res);
    if (isCompanionUnavailable(res.status, code)) return { kind: "unavailable" };
    return { kind: "error", message: code ?? `Could not load team chat status (${res.status})` };
  }
  const data = (await res.json()) as Partial<TeamChatStatus>;
  // A 200 without `connected` means another router answered; say so rather than guess.
  if (typeof data.connected !== "boolean") {
    return { kind: "error", message: "Could not load team chat status" };
  }
  return {
    kind: "ok",
    data: {
      connected: data.connected,
      email: data.email ?? null,
      contactEmail: data.contactEmail ?? null,
      yappchattUserId: data.yappchattUserId ?? null,
      groupId: data.groupId ?? null,
      linkedAt: data.linkedAt ?? null,
      canManage: data.canManage === true,
    },
  };
}

/** D5: ask which account would be linked or created. Changes nothing on either side. */
export async function previewTeamChatAccount(fetcher: TeamChatFetcher = apiFetch): Promise<TeamChatPreviewResult> {
  const res = await fetcher(TEAM_CHAT_API, {
    method: "POST",
    body: JSON.stringify({ confirm: false }),
  });
  if (!res.ok) {
    const code = await readErrorCode(res);
    if (isCompanionUnavailable(res.status, code)) return { kind: "unavailable" };
    if (res.status === 403) {
      return { kind: "error", message: "Only a company ADMIN can create the YappChatt account." };
    }
    return { kind: "error", message: code ?? `Could not check the YappChatt account (${res.status})` };
  }
  const data = (await res.json()) as { wouldLink?: Partial<TeamChatPreview> };
  const w = data.wouldLink;
  if (!w || typeof w.email !== "string" || typeof w.exists !== "boolean") {
    return { kind: "error", message: "Could not check the YappChatt account" };
  }
  return { kind: "ok", data: { email: w.email, exists: w.exists, displayName: w.displayName ?? null } };
}

export async function createTeamChatAccount(fetcher: TeamChatFetcher = apiFetch): Promise<TeamChatCreateResult> {
  const res = await fetcher(TEAM_CHAT_API, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
  if (!res.ok) {
    const code = await readErrorCode(res);
    if (isCompanionUnavailable(res.status, code)) return { kind: "unavailable" };
    if (res.status === 403) {
      return { kind: "error", message: "Only a company ADMIN can create the YappChatt account." };
    }
    return { kind: "error", message: code ?? `Could not create the YappChatt account (${res.status})` };
  }
  const data = (await res.json()) as TeamChatCreateResponse;
  return {
    kind: "ok",
    data: {
      ...data,
      members: {
        added: data.members?.added ?? 0,
        updated: data.members?.updated ?? 0,
        removed: data.members?.removed ?? 0,
        failed: Array.isArray(data.members?.failed) ? data.members.failed : [],
      },
    },
  };
}

export function tallyCount(tally: TeamChatMemberTally): number {
  return Array.isArray(tally) ? tally.length : tally;
}
// [SCOPE 144 / T012] END

// [SCOPE 144 / T012] BEGIN — TeamChatPanelView (presentational)
export interface TeamChatPanelViewProps {
  loading: boolean;
  status: TeamChatStatus | null;
  loadError: string | null;
  /** The companion answered 503 — on load or on the last create attempt. */
  unavailable: boolean;
  lastResult: TeamChatCreateResponse | null;
  createError: string | null;
  /** D5: the account the confirm dialog names. The dialog opens only once this is known. */
  preview: TeamChatPreview | null;
  confirmOpen: boolean;
  linkedNoticeOpen: boolean;
  pending: boolean;
  onOpenConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirm: () => void;
  onCloseLinkedNotice: () => void;
}

export function TeamChatPanelView(props: TeamChatPanelViewProps) {
  const {
    loading,
    status,
    loadError,
    unavailable,
    lastResult,
    createError,
    preview,
    confirmOpen,
    linkedNoticeOpen,
    pending,
    onOpenConfirm,
    onCancelConfirm,
    onConfirm,
    onCloseLinkedNotice,
  } = props;

  // The last create result is newer than the status that was loaded before it.
  const connected = lastResult !== null || status?.connected === true;
  const email = lastResult?.email ?? status?.email ?? null;
  const yappchattUserId = lastResult?.yappchattUserId ?? status?.yappchattUserId ?? null;
  const canManage = status?.canManage === true;
  const failed = lastResult?.members.failed ?? [];
  const willLink = preview?.exists === true;

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <MessagesSquare className="h-5 w-5" />
          Team chat (YappChatt)
        </CardTitle>
        <CardDescription className="text-slate-400">
          The company&apos;s own YappChatt account. Project rooms are created under it, and your
          team is added to the company group directly.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {unavailable && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/40 border border-amber-600/60 text-amber-200 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{TEAM_CHAT_UNAVAILABLE_MESSAGE}</span>
          </div>
        )}

        {loadError && (
          <div className="p-3 rounded-lg bg-red-900/50 text-red-200 text-sm">{loadError}</div>
        )}
        {createError && (
          <div className="p-3 rounded-lg bg-red-900/50 text-red-200 text-sm">{createError}</div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : connected ? (
          <div className="space-y-2 text-sm">
            <p className="text-slate-100">
              Connected: <span className="font-medium">{email}</span>
            </p>
            {yappchattUserId && (
              <p className="text-slate-400">
                YappChatt id: <code className="font-mono text-xs text-slate-300">{yappchattUserId}</code>
              </p>
            )}
            {lastResult?.outcome === "linked" && (
              <p className="text-slate-300">
                Linked to an existing YappChatt account for {lastResult.email}. No new account was
                created.
              </p>
            )}
            {lastResult?.outcome === "already" && (
              <p className="text-slate-400">Already connected. Nothing changed.</p>
            )}
            {lastResult && (
              <p className="text-slate-400">
                Group members: {tallyCount(lastResult.members.added)} added,{" "}
                {tallyCount(lastResult.members.updated)} updated,{" "}
                {tallyCount(lastResult.members.removed)} removed.
              </p>
            )}
            {failed.length > 0 && (
              <div className="p-3 rounded-lg bg-red-900/40 text-red-200">
                <p className="font-medium">
                  {failed.length} {failed.length === 1 ? "member was" : "members were"} not added:
                </p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {failed.map((f) => (
                    <li key={f.userid}>
                      <code className="font-mono text-xs">{f.userid}</code>: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : status ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-100">YappChatt account: not connected</p>
            {canManage && (
              <Button
                onClick={onOpenConfirm}
                disabled={pending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create YappChatt account
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>

      {/* Confirm — shadcn AlertDialog anatomy on the repo's Dialog primitive. Names the exact
          account (D5): an existing one is linked, otherwise a new one is created. */}
      <Dialog open={confirmOpen && preview !== null} onOpenChange={(open: boolean) => { if (!open) onCancelConfirm(); }}>
        <DialogContent role="alertdialog" aria-modal="true" className="bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle>
              {willLink ? "Link the existing YappChatt account?" : "Create the company YappChatt account?"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {willLink ? (
                <>
                  <span className="font-medium text-slate-100">{preview?.email}</span> already has a
                  YappChatt account{preview?.displayName ? ` (${preview.displayName})` : ""}. It will be
                  linked as the company account. No new account is created and no email is sent.
                </>
              ) : (
                <>
                  No YappChatt account exists for{" "}
                  <span className="font-medium text-slate-100">{preview?.email}</span>, the company
                  contact email. A new account will be created, and YappChatt sends it a welcome email
                  to set its password.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelConfirm} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={pending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {willLink ? "Link account" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link-found notice — names the existing account that was linked. */}
      <Dialog open={linkedNoticeOpen} onOpenChange={(open: boolean) => { if (!open) onCloseLinkedNotice(); }}>
        <DialogContent role="alertdialog" aria-modal="true" className="bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle>Linked to an existing YappChatt account</DialogTitle>
            <DialogDescription className="text-slate-400">
              {lastResult?.email} already had a YappChatt account
              {lastResult?.yappchattUserId ? ` (${lastResult.yappchattUserId})` : ""}. It is now
              the company account; no new account was created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onCloseLinkedNotice}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
// [SCOPE 144 / T012] END

// [SCOPE 144 / T012] BEGIN — TeamChatPanel (TanStack Query container)
export function TeamChatPanel() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<TeamChatPreview | null>(null);
  const [linkedNoticeOpen, setLinkedNoticeOpen] = useState(false);
  const [lastResult, setLastResult] = useState<TeamChatCreateResponse | null>(null);
  const [createUnavailable, setCreateUnavailable] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: TEAM_CHAT_QUERY_KEY,
    queryFn: () => loadTeamChatStatus(),
  });

  // D5: the dialog opens only once the server has said which account it would be.
  const check = useMutation({
    mutationFn: () => previewTeamChatAccount(),
    onSuccess: (result) => {
      if (result.kind === "unavailable") {
        setCreateUnavailable(true);
        return;
      }
      if (result.kind === "error") {
        setCreateError(result.message);
        return;
      }
      setCreateUnavailable(false);
      setPreview(result.data);
      setConfirmOpen(true);
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const create = useMutation({
    mutationFn: () => createTeamChatAccount(),
    onSuccess: async (result) => {
      setConfirmOpen(false);
      if (result.kind === "unavailable") {
        // FR-011: nothing changed on either side; leave the panel as it was.
        setCreateUnavailable(true);
        return;
      }
      if (result.kind === "error") {
        setCreateError(result.message);
        return;
      }
      setCreateUnavailable(false);
      setLastResult(result.data);
      if (result.data.outcome === "linked") setLinkedNoticeOpen(true);
      await queryClient.invalidateQueries({ queryKey: TEAM_CHAT_QUERY_KEY });
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      setCreateError(err.message);
    },
  });

  const loaded = query.data;
  const status = loaded?.kind === "ok" ? loaded.data : null;
  const loadError =
    loaded?.kind === "error" ? loaded.message : query.error ? query.error.message : null;

  return (
    <TeamChatPanelView
      loading={query.isLoading}
      status={status}
      loadError={loadError}
      unavailable={createUnavailable || loaded?.kind === "unavailable"}
      lastResult={lastResult}
      createError={createError}
      preview={preview}
      confirmOpen={confirmOpen}
      linkedNoticeOpen={linkedNoticeOpen}
      pending={check.isPending || create.isPending}
      onOpenConfirm={() => {
        setCreateError(null);
        check.mutate();
      }}
      onCancelConfirm={() => {
        setConfirmOpen(false);
        setPreview(null);
      }}
      onConfirm={() => create.mutate()}
      onCloseLinkedNotice={() => setLinkedNoticeOpen(false)}
    />
  );
}
// [SCOPE 144 / T012] END
