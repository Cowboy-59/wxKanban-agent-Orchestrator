/**
 * The project's Change Impact mode, set by its owner — SCOPE-137 Amendment A (FR-007a).
 *
 * The kit's Change Impact check reads this through the hosted MCP and caches it; once set here
 * it overrides any value a developer typed into their local .wxai/project.json. Everyone with
 * access sees the mode and who set it; only the owner or a company administrator can change it
 * (the server enforces that; the disabled controls only say so).
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, GitBranch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { useTranslation } from "~/client/i18n";

// [SCOPE 137 / T019] BEGIN — ImpactModePanel
type Mode = "notify" | "boundaries" | "always";

interface OwnerImpactMode {
  mode: Mode;
  previous: Mode | null;
  setBy: string;
  setAt: string;
}

interface Props {
  projectId: string;
}

const LABEL_KEYS: Record<Mode, string> = {
  notify: "projectWorkspace.impactModeNotify",
  boundaries: "projectWorkspace.impactModeBoundaries",
  always: "projectWorkspace.impactModeAlways",
};

export function ImpactModePanel({ projectId }: Props) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<OwnerImpactMode | null>(null);
  const [canChange, setCanChange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/projects/${projectId}/impact-mode`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { credentials: "include" });
      if (!res.ok) throw new Error(t("projectWorkspace.impactModeError"));
      const data = (await res.json()) as { impactMode: OwnerImpactMode | null; canChange: boolean };
      setCurrent(data.impactMode);
      setCanChange(data.canChange);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [base, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (mode: Mode): Promise<void> => {
    if (mode === current?.mode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(t("projectWorkspace.impactModeError"));
      // Re-read: the server's record (who, when) is what the kit will see.
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          {t("projectWorkspace.impactModeTitle")}
        </CardTitle>
        <CardDescription className="text-slate-400">{t("projectWorkspace.impactModeHelp")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && <div className="p-3 rounded-lg bg-red-900/50 text-red-200 text-sm">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <>
            <fieldset className="space-y-2" disabled={!canChange || busy}>
              <legend className="sr-only">{t("projectWorkspace.impactModeTitle")}</legend>
              {(Object.keys(LABEL_KEYS) as Mode[]).map((mode) => (
                <label
                  key={mode}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700 cursor-pointer has-[:disabled]:cursor-default"
                >
                  <input
                    type="radio"
                    name={`impact-mode-${projectId}`}
                    value={mode}
                    checked={current?.mode === mode}
                    onChange={() => void choose(mode)}
                    className="mt-0.5 h-4 w-4 border-slate-600 bg-slate-800"
                  />
                  <span className="text-sm text-white">{t(LABEL_KEYS[mode])}</span>
                </label>
              ))}
            </fieldset>

            <p className="text-slate-400 text-xs">
              {current
                ? t("projectWorkspace.impactModeSetBy", {
                    who: current.setBy,
                    when: new Date(current.setAt).toLocaleString(),
                  })
                : t("projectWorkspace.impactModeNotSet")}
            </p>
            <p className="text-slate-400 text-xs">{t("projectWorkspace.impactModeDataLoss")}</p>
            {!canChange && <p className="text-amber-300 text-xs">{t("projectWorkspace.impactModeOwnerOnly")}</p>}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
// [SCOPE 137 / T019] END
