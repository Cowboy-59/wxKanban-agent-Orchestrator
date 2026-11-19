/**
 * EngagementDetailPage
 * Spec 037 — Consultants Management (Engagement Core), T054 + T055 + T056 + T060
 *
 * Route: /engagements/:id
 *
 * Single page rendering both Client and Consulting Company views of an
 * engagement. The backend's auth-context resolver decides what to return; the
 * frontend renders different controls based on `role` returned in the detail
 * response.
 *
 * - Both sides: see assignments grouped by project, engagement state, lifecycle history.
 * - Client side only: AssignmentEditor (add/remove scopes/tasks), lifecycle action buttons.
 * - Consulting side only: SubAssignmentEditor (assign members to assignments), invoice CTA.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pause,
  Play,
  Ban,
  Power,
  OctagonX,
  Plus,
  Trash2,
  Users,
  AlertCircle,
  Receipt,
} from "lucide-react";
import { Checkbox } from "../components/ui/Checkbox";

interface EngagementDetail {
  id: string;
  state: "active" | "paused" | "disabled" | "ended";
  role: "client" | "consulting";
  client: { id: string; name: string } | null;
  consulting: { id: string; name: string } | null;
  createdAt: string;
  acceptedAt: string;
  pausedAt: string | null;
  disabledAt: string | null;
  endedAt: string | null;
  assignmentCount: number;
  subAssignmentCount?: number;
}

interface AssignmentGroup {
  projectId: string;
  projectName: string;
  assignments: Array<{
    id: string;
    scopeid: string | null;
    taskid: string | null;
    projectid: string;
    addedat: string;
    addedbyid: string;
    removedat: string | null;
  }>;
}

interface SubAssignmentRow {
  id: string;
  engagementassignmentid: string;
  consultingmemberid: string;
  assignedat: string;
  memberfullname: string;
  memberemail: string;
  memberactive: boolean;
  scopeid: string | null;
  taskid: string | null;
  projectid: string;
}

// [SCOPE 037 / T054] BEGIN — EngagementDetailPage
// MODIFIED-BY: [SCOPE 037 / T082] — whole-project assignments badged "whole project", not "task" (FR-006)
export default function EngagementDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [detail, setDetail] = useState<EngagementDetail | null>(null);
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [subs, setSubs] = useState<SubAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const detRes = await fetch(`/api/engagements/${id}`, {
        credentials: "include",
      });
      if (!detRes.ok) {
        const body = await detRes.json();
        throw new Error(body.error || "Failed to load engagement");
      }
      const det = (await detRes.json()) as EngagementDetail;
      setDetail(det);

      const asgRes = await fetch(`/api/engagements/${id}/assignments`, {
        credentials: "include",
      });
      if (asgRes.ok) {
        const data = (await asgRes.json()) as { groups: AssignmentGroup[] };
        setGroups(data.groups);
      }

      if (det.role === "consulting") {
        const subRes = await fetch(`/api/engagements/${id}/subassignments`, {
          credentials: "include",
        });
        if (subRes.ok) {
          const data = (await subRes.json()) as {
            subassignments: SubAssignmentRow[];
          };
          setSubs(data.subassignments);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const transition = async (
    action: "pause" | "resume" | "disable" | "enable" | "end",
  ) => {
    if (!detail) return;
    if (
      action === "end" &&
      !confirm(
        `End this engagement with ${detail.role === "client" ? detail.consulting?.name : detail.client?.name}? This is permanent.`,
      )
    ) {
      return;
    }
    try {
      const r = await fetch(`/api/engagements/${detail.id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json();
        throw new Error(body.error || `Failed to ${action}`);
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-6">
        <p className="text-slate-400">Loading engagement…</p>
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="min-h-screen bg-slate-900 p-6">
        <p className="text-red-400">{error ?? "Engagement not found"}</p>
      </div>
    );
  }

  const counterparty =
    detail.role === "client" ? detail.consulting : detail.client;
  const stateBadge = {
    active: "bg-green-500/20 text-green-300 border-green-500/40",
    paused: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    disabled: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    ended: "bg-red-500/20 text-red-300 border-red-500/40",
  }[detail.state];

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">
              Engagement with {counterparty?.name ?? "Unknown"}
            </h1>
            <p className="text-sm text-slate-400">
              You are viewing as the{" "}
              <span className="font-semibold capitalize">{detail.role}</span> side
            </p>
          </div>
          <span
            className={`text-xs font-medium px-2 py-1 rounded border ${stateBadge}`}
          >
            {detail.state}
          </span>
        </div>

        {/* Lifecycle controls (Client ADMIN only) */}
        {detail.role === "client" && (
          // [SCOPE 037 / T060] BEGIN — lifecycle action buttons
          <div className="flex flex-wrap gap-2">
            {detail.state === "active" && (
              <>
                <button
                  onClick={() => transition("pause")}
                  className="px-3 py-2 text-sm border border-amber-600/60 text-amber-300 hover:bg-amber-500/10 rounded inline-flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" /> Pause
                </button>
                <button
                  onClick={() => transition("disable")}
                  className="px-3 py-2 text-sm border border-slate-500 text-slate-300 hover:bg-slate-700 rounded inline-flex items-center gap-2"
                >
                  <Ban className="w-4 h-4" /> Disable
                </button>
              </>
            )}
            {detail.state === "paused" && (
              <button
                onClick={() => transition("resume")}
                className="px-3 py-2 text-sm border border-green-600/60 text-green-300 hover:bg-green-500/10 rounded inline-flex items-center gap-2"
              >
                <Play className="w-4 h-4" /> Resume
              </button>
            )}
            {detail.state === "disabled" && (
              <button
                onClick={() => transition("enable")}
                className="px-3 py-2 text-sm border border-green-600/60 text-green-300 hover:bg-green-500/10 rounded inline-flex items-center gap-2"
              >
                <Power className="w-4 h-4" /> Re-enable
              </button>
            )}
            {detail.state !== "ended" && (
              <button
                onClick={() => transition("end")}
                className="px-3 py-2 text-sm border border-red-600/60 text-red-300 hover:bg-red-500/10 rounded inline-flex items-center gap-2"
              >
                <OctagonX className="w-4 h-4" /> End (terminal)
              </button>
            )}
          </div>
          // [SCOPE 037 / T060] END
        )}

        {/* Consulting Co. invoice CTA */}
        {detail.role === "consulting" && detail.state !== "ended" && (
          <div>
            <button
              onClick={() => setShowInvoiceForm(true)}
              className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded inline-flex items-center gap-2"
            >
              <Receipt className="w-4 h-4" /> Generate B2B invoice
            </button>
          </div>
        )}

        {/* Assignments */}
        <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Assignments ({detail.assignmentCount})
              </h2>
              <p className="text-xs text-slate-500">
                Scopes and tasks the Consulting Company can work on.
              </p>
            </div>
            {detail.role === "client" && detail.state === "active" && (
              <button
                onClick={() => setShowAddAssignment(true)}
                className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white font-medium rounded inline-flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            )}
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-slate-500">
              No assignments yet. {detail.role === "client" ? 'Click "Add" to grant a scope or task.' : "The Client has not assigned any work yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.projectId}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {g.projectName}
                  </p>
                  <ul className="space-y-1">
                    {g.assignments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between p-2 rounded bg-slate-900/50 border border-slate-700/50"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          {a.scopeid ? (
                            <>
                              <span className="text-xs px-1.5 py-0.5 bg-sky-500/20 text-sky-300 rounded">
                                scope
                              </span>
                              <code className="text-slate-200">{a.scopeid}</code>
                            </>
                          ) : !a.taskid ? (
                            // FR-006 whole-project grant: no scope, no task.
                            <>
                              <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">
                                whole project
                              </span>
                              <span className="text-slate-400 text-xs">
                                every current and future scope and task
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded">
                                task
                              </span>
                              <code className="text-slate-300 text-xs">
                                {a.taskid}
                              </code>
                            </>
                          )}
                        </div>
                        {detail.role === "client" &&
                          detail.state === "active" && (
                            <button
                              onClick={async () => {
                                if (!confirm("Remove this assignment?")) return;
                                const r = await fetch(
                                  `/api/engagements/${detail.id}/assignments/${a.id}`,
                                  {
                                    method: "DELETE",
                                    credentials: "include",
                                  },
                                );
                                if (r.ok) load();
                                else {
                                  const body = await r.json();
                                  alert(body.error ?? "Failed to remove");
                                }
                              }}
                              className="text-slate-500 hover:text-red-400 p-1"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sub-assignments (Consulting side only) */}
        {detail.role === "consulting" && (
          // [SCOPE 037 / T056] BEGIN — SubAssignmentEditor
          // MODIFIED-BY: [SCOPE 037 / T082] — whole-project sub-assignment label (FR-006)
          <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-semibold text-white">
                Sub-Assignments ({detail.subAssignmentCount ?? 0})
              </h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Your firm's internal distribution of this engagement. Not visible
              to the Client.
            </p>
            {subs.length === 0 ? (
              <p className="text-sm text-slate-500">
                No members sub-assigned yet. Open an Assignment to distribute it
                to your team members.
              </p>
            ) : (
              <ul className="space-y-2">
                {subs.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between p-2 rounded bg-slate-900/50 border border-slate-700/50"
                  >
                    <div className="text-sm text-slate-200">
                      <span className="font-medium">{s.memberfullname}</span>
                      <span className="text-xs text-slate-500 ml-2">
                        ({s.memberemail})
                      </span>
                      {!s.memberactive && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded">
                          inactive — reassign
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {s.scopeid
                          ? `scope ${s.scopeid}`
                          : s.taskid
                            ? `task ${s.taskid.slice(0, 8)}…`
                            : "whole project"}
                      </span>
                      <button
                        onClick={async () => {
                          if (!confirm("Remove this sub-assignment?")) return;
                          const r = await fetch(
                            `/api/engagements/${detail.id}/subassignments/${s.id}`,
                            {
                              method: "DELETE",
                              credentials: "include",
                            },
                          );
                          if (r.ok) load();
                          else {
                            const body = await r.json();
                            alert(body.error ?? "Failed to remove");
                          }
                        }}
                        className="text-slate-500 hover:text-red-400 p-1"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          // [SCOPE 037 / T056] END
        )}

        {/* Quick assignment-add form (Client side) — inline for MVP. */}
        {showAddAssignment && detail.role === "client" && (
          // [SCOPE 037 / T055] BEGIN — AssignmentEditor (minimal add form)
          <QuickAddAssignmentDialog
            engagementId={detail.id}
            onClose={() => setShowAddAssignment(false)}
            onSuccess={() => {
              setShowAddAssignment(false);
              void load();
            }}
          />
          // [SCOPE 037 / T055] END
        )}

        {/* Invoice form (Consulting side) */}
        {showInvoiceForm && detail.role === "consulting" && (
          // [SCOPE 037 / T059] BEGIN — InvoiceGenerator inline form
          <QuickGenerateInvoiceDialog
            engagementId={detail.id}
            onClose={() => setShowInvoiceForm(false)}
            onSuccess={() => {
              setShowInvoiceForm(false);
            }}
          />
          // [SCOPE 037 / T059] END
        )}
      </div>
    </div>
  );
}
// [SCOPE 037 / T054] END

// [SCOPE 037 / T055] BEGIN — QuickAddAssignmentDialog (picker UX)
// MODIFIED-BY: [SCOPE 037 / T080] — "All projects" checkbox on the Whole project tab (FR-031)
//
// Replaces the prior UUID-typing form with proper dropdowns:
//   - Project dropdown (loaded from /api/projects)
//   - Scope dropdown (loaded from /api/projects/:id/scopes after project picked)
//   - Task dropdown (loaded from /api/projects/:id/scopes/:scopeid/tasks when on Task tab)
//
// No UUID typing required; the Client ADMIN can browse what they own.
interface ProjectOption {
  id: string;
  name: string;
}
interface ScopeOption {
  id: string;
  specnumber: string;
  title: string;
}
interface TaskOption {
  id: string;
  name: string;
  status: string | null;
}

function QuickAddAssignmentDialog({
  engagementId,
  onClose,
  onSuccess,
}: {
  engagementId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [kind, setKind] = useState<"project" | "scope" | "task">("scope");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scopeSpecnumber, setScopeSpecnumber] = useState("");
  const [scopeUuid, setScopeUuid] = useState(""); // needed for task-list fetch
  const [taskId, setTaskId] = useState("");
  const [allProjects, setAllProjects] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bulk = kind === "project" && allProjects;

  // Load projects on mount
  useEffect(() => {
    fetch("/api/projects", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { projects?: ProjectOption[] } | ProjectOption[];
        const list = Array.isArray(data) ? data : (data.projects ?? []);
        setProjects(list);
      })
      .catch(() => undefined);
  }, []);

  // Load scopes when project changes
  useEffect(() => {
    if (!projectId) {
      setScopes([]);
      setScopeSpecnumber("");
      setScopeUuid("");
      return;
    }
    fetch(`/api/projects/${projectId}/scopes`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { scopes: ScopeOption[] };
        setScopes(data.scopes ?? []);
      })
      .catch(() => undefined);
  }, [projectId]);

  // Load tasks when scope changes (Task tab only)
  useEffect(() => {
    if (kind !== "task" || !projectId || !scopeUuid) {
      setTasks([]);
      setTaskId("");
      return;
    }
    fetch(`/api/projects/${projectId}/scopes/${scopeUuid}/tasks`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as TaskOption[];
        setTasks(data);
      })
      .catch(() => undefined);
  }, [kind, projectId, scopeUuid]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (bulk) {
        // FR-031: one-time bulk add of every ACTIVE client project not already held.
        const r = await fetch(`/api/engagements/${engagementId}/assignments`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allProjects: true }),
        });
        const body = (await r.json()) as {
          error?: string;
          added?: unknown[];
          projectids?: unknown[];
          skipped?: unknown[];
          queued?: boolean;
        };
        if (!r.ok) throw new Error(body.error || "Failed to add");
        const added = (body.queued ? body.projectids : body.added)?.length ?? 0;
        const skipped = body.skipped?.length ?? 0;
        const verb = body.queued ? "queued (engagement not active)" : "added";
        setBulkResult(
          added === 0
            ? `Nothing to add — this engagement already covers all ${skipped} active project${skipped === 1 ? "" : "s"}.`
            : `${added} project${added === 1 ? "" : "s"} ${verb}${skipped ? `; ${skipped} already assigned` : ""}.`,
        );
        return;
      }
      const payload: Record<string, string> = { projectid: projectId };
      if (kind === "scope") {
        payload.scopeid = scopeSpecnumber;
      } else if (kind === "task") {
        payload.taskid = taskId;
      }
      // kind === "project" → projectid only (whole-project grant)
      const r = await fetch(`/api/engagements/${engagementId}/assignments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Failed to add");
      // 202 = queued (engagement paused/disabled). Either way, refresh.
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    bulk ||
    (!!projectId &&
    (kind === "project"
      ? true
      : kind === "scope"
        ? !!scopeSpecnumber
        : !!taskId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700 space-y-4">
        <h3 className="text-lg font-semibold text-white">Add assignment</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind("project")}
            className={`flex-1 px-3 py-2 text-sm rounded ${kind === "project" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"}`}
          >
            Whole project
          </button>
          <button
            type="button"
            onClick={() => setKind("scope")}
            className={`flex-1 px-3 py-2 text-sm rounded ${kind === "scope" ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300"}`}
          >
            Whole scope
          </button>
          <button
            type="button"
            onClick={() => setKind("task")}
            className={`flex-1 px-3 py-2 text-sm rounded ${kind === "task" ? "bg-violet-600 text-white" : "bg-slate-700 text-slate-300"}`}
          >
            Specific task
          </button>
        </div>
        {kind === "project" && (
          <p className="text-xs text-slate-400 -mt-1">
            Grants the consultant every current and future scope and task in
            this project until removed.
          </p>
        )}
        {kind === "project" && (
          <div className="flex items-start gap-2">
            <Checkbox
              id="assign-all-projects"
              checked={allProjects}
              onCheckedChange={(v: boolean) => {
                setAllProjects(v);
                setBulkResult(null);
                setError(null);
              }}
              className="mt-0.5"
            />
            <label htmlFor="assign-all-projects" className="text-sm text-slate-200 cursor-pointer">
              All projects
              <span className="block text-xs text-slate-400">
                Adds every active project you have now. Projects created later
                are not included; add them here when you create them.
              </span>
            </label>
          </div>
        )}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Project</label>
            <select
              required={!bulk}
              value={bulk ? "" : projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={bulk}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 disabled:opacity-50"
            >
              <option value="">{bulk ? "All active projects" : "Choose a project…"}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {kind !== "project" && (
          <div>
            <label className="text-xs text-slate-400 block mb-1">Scope</label>
            <select
              required
              value={kind === "scope" ? scopeSpecnumber : scopeUuid}
              onChange={(e) => {
                if (kind === "scope") {
                  setScopeSpecnumber(e.target.value);
                  // also track the matching uuid for task-tab consistency
                  const s = scopes.find((x) => x.specnumber === e.target.value);
                  setScopeUuid(s?.id ?? "");
                } else {
                  setScopeUuid(e.target.value);
                  const s = scopes.find((x) => x.id === e.target.value);
                  setScopeSpecnumber(s?.specnumber ?? "");
                }
              }}
              disabled={!projectId}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 disabled:opacity-50"
            >
              <option value="">
                {projectId ? "Choose a scope…" : "Pick a project first"}
              </option>
              {scopes.map((s) => (
                <option
                  key={s.id}
                  value={kind === "scope" ? s.specnumber : s.id}
                >
                  {s.specnumber} — {s.title}
                </option>
              ))}
            </select>
          </div>
          )}

          {kind === "task" && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Task</label>
              <select
                required
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                disabled={!scopeUuid}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 disabled:opacity-50"
              >
                <option value="">
                  {scopeUuid ? "Choose a task…" : "Pick a scope first"}
                </option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.status ? ` (${t.status})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {bulkResult ? (
            <div className="space-y-3">
              <p role="status" className="text-sm text-emerald-300">{bulkResult}</p>
              <button
                type="button"
                onClick={onSuccess}
                className="w-full px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded text-sm"
              >
                Done
              </button>
            </div>
          ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 border border-slate-600 text-slate-200 rounded text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="flex-1 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Adding…" : bulk ? "Add all projects" : "Add"}
            </button>
          </div>
          )}
        </form>
      </div>
    </div>
  );
}
// [SCOPE 037 / T055] END

// [SCOPE 037 / T059] BEGIN — QuickGenerateInvoiceDialog
function QuickGenerateInvoiceDialog({
  engagementId,
  onClose,
  onSuccess,
}: {
  engagementId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    invoiceNumber: string;
    totalAmount: number;
    hoursWorked: number;
    deliveredEmail: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/engagements/${engagementId}/invoice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Failed");
      setResult(body);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700 space-y-4">
        <h3 className="text-lg font-semibold text-white">
          Generate B2B invoice
        </h3>
        {result ? (
          <div className="space-y-3">
            <div className="bg-emerald-500/10 border border-emerald-500/40 rounded p-3 text-sm">
              <p className="text-emerald-300 font-semibold">Invoice generated</p>
              <p className="text-slate-300 mt-1">
                #{result.invoiceNumber} — ${result.totalAmount.toFixed(2)} for{" "}
                {result.hoursWorked.toFixed(1)} hours
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Email delivery:{" "}
                {result.deliveredEmail ? "sent ✓" : "FAILED (will retry)"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full px-3 py-2 bg-sky-600 text-white rounded text-sm"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-slate-400">
              This invoices all billable, uninvoiced time entries logged
              against this engagement to date. Delivery goes to the Client
              Company's billing email.
            </p>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-3 py-2 border border-slate-600 text-slate-200 rounded text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm disabled:opacity-50"
              >
                {loading ? "Generating…" : "Generate"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
// [SCOPE 037 / T059] END
