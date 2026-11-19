/**
 * SCOPE-137 / T014 (FR-013) — the scope's Change Impact agreement log, read-only.
 *
 * Every agreement to a change's impact (a developer's own hand edit, or an approval of the AI's
 * edit at an Impact Boundary) and every unattended crossing that touched this scope, newest first.
 * Records cannot be changed from here or anywhere else: there is no edit or delete control.
 * Loads on first open, like the scope's task list.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { useTranslation } from "../../i18n";

// [SCOPE 137 / T014] BEGIN — Read-only Change Impact log for one scope
interface ChangeImpactRecord {
  id: string;
  type: "change_impact_ack" | "change_impact_approval" | "change_impact_crossing";
  actor: string;
  createdAt: string;
  occurredAt: string | null;
  attended: boolean;
  mode: string | null;
  answer: string | null;
  queued: boolean;
  changedFiles: string[];
  affected: number;
  reasons: Array<{ kind: string; detail: string }>;
}

const KIND_STYLE: Record<ChangeImpactRecord["type"], string> = {
  change_impact_ack: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  change_impact_approval: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  change_impact_crossing: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export function ScopeChangeImpactLog({ projectId, scopeId }: { projectId: string; scopeId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<ChangeImpactRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    const token = localStorage.getItem("wxkanban_token");
    fetch(`/api/projects/${projectId}/scopes/${scopeId}/change-impact`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ records?: ChangeImpactRecord[] }>;
      })
      .then((data) => setRecords(Array.isArray(data.records) ? data.records : []))
      .catch(() => setFailed(true));
  }, [open, projectId, scopeId]);

  const kindLabel = (r: ChangeImpactRecord) => {
    if (r.type === "change_impact_ack") return t("projectPanel.changeImpactKindAck");
    if (r.type === "change_impact_crossing") return t("projectPanel.changeImpactKindCrossing");
    return r.answer === "decline" ? t("projectPanel.changeImpactKindDeclined") : t("projectPanel.changeImpactKindApproval");
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 mb-1.5"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {records ? t("projectPanel.changeImpactCount", { count: records.length }) : t("projectPanel.changeImpactTitle")}
      </button>

      {open && (
        <div className="space-y-1.5">
          {failed && <p className="text-[11px] text-red-600 dark:text-red-400">{t("projectPanel.changeImpactError")}</p>}
          {!failed && records === null && <p className="text-[11px] text-gray-400">{t("projectPanel.changeImpactLoading")}</p>}
          {records && records.length === 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("projectPanel.changeImpactEmpty")}</p>
          )}
          {records && records.length > 0 && (
            <ul className="space-y-1.5">
              {records.map((r) => (
                <li key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${KIND_STYLE[r.type]}`}>
                      <ShieldCheck className="w-3 h-3" />
                      {kindLabel(r)}
                    </span>
                    <span className="font-medium text-gray-700 dark:text-gray-200">{r.actor}</span>
                    <time className="text-gray-500 dark:text-gray-400" dateTime={r.occurredAt ?? r.createdAt}>
                      {new Date(r.occurredAt ?? r.createdAt).toLocaleString()}
                    </time>
                    <span className="text-gray-500 dark:text-gray-400">{t("projectPanel.changeImpactAffected", { count: r.affected })}</span>
                    {r.mode && <span className="text-gray-400 dark:text-gray-500">impactMode {r.mode}</span>}
                    {r.queued && <span className="text-gray-400 dark:text-gray-500">· {t("projectPanel.changeImpactQueued")}</span>}
                  </div>
                  <p className="mt-1 text-[10px] font-mono text-gray-600 dark:text-gray-300 break-all">{r.changedFiles.join(", ")}</p>
                  {r.reasons.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-[11px] text-gray-600 dark:text-gray-300">
                      {r.reasons.map((reason, i) => (
                        <li key={i}>{reason.detail}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {records && <p className="text-[10px] text-gray-400 dark:text-gray-500">{t("projectPanel.changeImpactReadOnly")}</p>}
        </div>
      )}
    </div>
  );
}
// [SCOPE 137 / T014] END
