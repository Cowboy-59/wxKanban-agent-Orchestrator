/**
 * ConsultantsPanel — role-aware engagement view
 * Spec 037 — T052
 *
 * Renders on the Team Members page. Splits the caller's engagements by role:
 *   - role=client      → "Consulting firms working on your projects"
 *                         (Client side: you are engaging consulting firms)
 *   - role=consulting  → "Your client engagements"
 *                         (Consulting side: you are doing work for clients)
 *
 * Same backend (/api/engagements returns both, tagged with `role`). The same
 * tenant CAN have both — a CONSULTANT-plan firm that also engages OTHER
 * consulting firms would see both sections.
 *
 * Invite CTA is always shown (any tenant ADMIN can invite a Consulting
 * Company). Lifecycle actions are role-conditional: Client side gets pause/
 * disable/end; Consulting side gets a B2B-invoice CTA.
 */

import { useEffect, useState } from "react";
import {
  Briefcase,
  Plus,
  Pause,
  Play,
  OctagonX,
  Ban,
  Power,
  Receipt,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { InviteConsultingCompanyModal } from "./InviteConsultingCompanyModal";

interface EngagementSummary {
  id: string;
  state: "active" | "paused" | "disabled" | "ended";
  role: "client" | "consulting";
  counterpartyCompanyId: string;
  counterpartyCompanyName: string;
  createdAt: string;
  acceptedAt: string;
  pausedAt: string | null;
  disabledAt: string | null;
  endedAt: string | null;
  projects: { id: string; name: string }[];
}

interface BillingSummary {
  memberCount: number;
  totalHours: number;
  totalDollars: number;
}

// [SCOPE 037 / T052] BEGIN — ConsultantsPanel (role-aware)
export function ConsultantsPanel() {
  const navigate = useNavigate();
  const [clientSide, setClientSide] = useState<EngagementSummary[]>([]);
  const [consultingSide, setConsultingSide] = useState<EngagementSummary[]>(
    [],
  );
  const [billingByEngagement, setBillingByEngagement] = useState<
    Record<string, BillingSummary>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<Record<string, unknown> | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const loadEngagements = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/engagements?includeEnded=false", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json()) as {
          error?: string;
          details?: Record<string, unknown>;
        };
        setErrorDetails(body.details ?? null);
        throw new Error(body.error || "Failed to load engagements");
      }
      const data = (await res.json()) as { engagements: EngagementSummary[] };
      const c = data.engagements.filter((e) => e.role === "client");
      const s = data.engagements.filter((e) => e.role === "consulting");
      setClientSide(c);
      setConsultingSide(s);

      // Billing aggregates for ALL engagements (both sides). Backend filters
      // by role internally; FR-016 aggregate is the only Client-visible
      // metric. For Consulting side we get the same numbers but they're
      // their own earnings.
      const billingResults = await Promise.allSettled(
        data.engagements.map(async (e) => {
          const r = await fetch(
            `/api/engagements/${e.id}/billing?window=engagement-to-date`,
            { credentials: "include" },
          );
          if (!r.ok) throw new Error("billing");
          const b = (await r.json()) as BillingSummary;
          return [e.id, b] as const;
        }),
      );
      const map: Record<string, BillingSummary> = {};
      for (const result of billingResults) {
        if (result.status === "fulfilled") {
          const [id, summary] = result.value;
          map[id] = summary;
        }
      }
      setBillingByEngagement(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEngagements();
  }, []);

  const transition = async (
    engagementId: string,
    action: "pause" | "resume" | "disable" | "enable" | "end",
  ) => {
    try {
      const r = await fetch(`/api/engagements/${engagementId}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json();
        throw new Error(body.error || `Failed to ${action}`);
      }
      await loadEngagements();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action}`);
    }
  };

  const stateBadge = (state: EngagementSummary["state"]) =>
    ({
      active: "bg-green-100 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/40",
      paused: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40",
      disabled: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40",
      ended: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40",
    })[state];

  const renderProjectsLine = (
    eng: EngagementSummary,
    label: string,
    clickable: boolean,
  ) => (
    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
      <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
        {label}
      </p>
      {eng.projects.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
          No projects assigned yet
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {eng.projects.map((p) =>
            clickable ? (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/projects/${p.id}`)}
                className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/25 border border-sky-200 dark:border-sky-500/30 cursor-pointer"
                title={`Open project: ${p.name}`}
              >
                {p.name}
              </button>
            ) : (
              <span
                key={p.id}
                className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30"
              >
                {p.name}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );

  const renderClientCard = (eng: EngagementSummary) => {
    const billing = billingByEngagement[eng.id];
    return (
      <div
        key={eng.id}
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-5 space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {eng.counterpartyCompanyName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Engaged since {new Date(eng.acceptedAt).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded border ${stateBadge(eng.state)}`}
          >
            {eng.state}
          </span>
        </div>

        {renderProjectsLine(eng, "Projects assigned", false)}

        {billing && (
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Members</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{billing.memberCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Hours</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{billing.totalHours.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Billed</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">${billing.totalDollars.toFixed(0)}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => navigate(`/engagements/${eng.id}`)}
            className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded"
          >
            Open
          </button>
          {eng.state === "active" && (
            <>
              <button
                onClick={() => transition(eng.id, "pause")}
                className="px-3 py-1.5 text-xs font-medium border border-amber-500/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded inline-flex items-center gap-1"
              >
                <Pause className="w-3 h-3" /> Pause
              </button>
              <button
                onClick={() => transition(eng.id, "disable")}
                className="px-3 py-1.5 text-xs font-medium border border-slate-400 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded inline-flex items-center gap-1"
              >
                <Ban className="w-3 h-3" /> Disable
              </button>
            </>
          )}
          {eng.state === "paused" && (
            <button
              onClick={() => transition(eng.id, "resume")}
              className="px-3 py-1.5 text-xs font-medium border border-green-500/60 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-500/10 rounded inline-flex items-center gap-1"
            >
              <Play className="w-3 h-3" /> Resume
            </button>
          )}
          {eng.state === "disabled" && (
            <button
              onClick={() => transition(eng.id, "enable")}
              className="px-3 py-1.5 text-xs font-medium border border-green-500/60 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-500/10 rounded inline-flex items-center gap-1"
            >
              <Power className="w-3 h-3" /> Re-enable
            </button>
          )}
          {eng.state !== "ended" && (
            <button
              onClick={() => {
                if (
                  confirm(
                    `End engagement with ${eng.counterpartyCompanyName}? This is permanent.`,
                  )
                ) {
                  void transition(eng.id, "end");
                }
              }}
              className="px-3 py-1.5 text-xs font-medium border border-red-500/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 rounded inline-flex items-center gap-1"
            >
              <OctagonX className="w-3 h-3" /> End
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderConsultingCard = (eng: EngagementSummary) => {
    const billing = billingByEngagement[eng.id];
    return (
      <div
        key={eng.id}
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-5 space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Client</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {eng.counterpartyCompanyName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Engaged since {new Date(eng.acceptedAt).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded border ${stateBadge(eng.state)}`}
          >
            {eng.state}
          </span>
        </div>

        {renderProjectsLine(eng, "Projects you're working on", true)}

        {billing && (
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">My members</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{billing.memberCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Hours</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{billing.totalHours.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Earned</p>
              <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">${billing.totalDollars.toFixed(0)}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => navigate(`/engagements/${eng.id}`)}
            className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded"
          >
            Open
          </button>
          {eng.state === "active" && (
            <button
              onClick={() => navigate(`/engagements/${eng.id}`)}
              className="px-3 py-1.5 text-xs font-medium border border-emerald-500/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded inline-flex items-center gap-1"
              title="Generate B2B invoice (opens engagement)"
            >
              <Receipt className="w-3 h-3" /> Invoice
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <section className="space-y-4 mt-8">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Loading consultants…
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="space-y-4 mt-8">
        <div className="rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300 space-y-3">
          <div>{error}</div>
          {errorDetails && (
            <details open className="text-xs">
              <summary className="cursor-pointer font-semibold">
                Full error detail (server)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">
                {JSON.stringify(errorDetails, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </section>
    );
  }

  const hasAny = clientSide.length > 0 || consultingSide.length > 0;

  return (
    <section className="space-y-6 mt-8">
      {/* Header — always shown so the Invite CTA is visible even with no engagements. */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-sky-500 dark:text-sky-400" />
            Consultants
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Engagements between your company and Consulting Companies. They
            don't count against your seat cap and only see what you assign.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Invite Consulting Company
        </button>
      </div>

      {/* Empty state when both sides have zero engagements. */}
      {!hasAny && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center">
          <Briefcase className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
            No consulting engagements yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Invite a Consulting Company to start a scoped engagement.
          </p>
        </div>
      )}

      {/* Client-side engagements: I'm hiring consultants. */}
      {clientSide.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Consulting firms working on your projects ({clientSide.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clientSide.map(renderClientCard)}
          </div>
        </div>
      )}

      {/* Consulting-side engagements: I'm doing work for clients. */}
      {consultingSide.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Your client engagements ({consultingSide.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {consultingSide.map(renderConsultingCard)}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteConsultingCompanyModal
          onClose={() => setShowInvite(false)}
          onSuccess={loadEngagements}
        />
      )}
    </section>
  );
}
// [SCOPE 037 / T052] END
