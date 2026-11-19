import { useEffect, useState } from "react";
import { Button } from "~/client/components/ui/Button";
import { Checkbox } from "~/client/components/ui/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/client/components/ui/Dialog";
import { Input } from "~/client/components/ui/Input";
import { useTranslation } from "~/client/i18n";
import type { ProjectTimeSummary } from "~/shared/types/timeBilling";
import { tbFetch } from "./api";

// [SCOPE 005 / T018] BEGIN — ProjectRatesDialog: set or clear a project's rate overrides (FR-008)
interface ProjectRatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectTimeSummary | null;
}

interface RatesResult {
  developerRate: string | null;
  resourceRate: string | null;
}

/**
 * A blank field leaves that rate as it is; "use the company default" clears the override.
 * New entries take the rate in force; existing entries keep theirs (FR-008).
 */
export function ProjectRatesDialog({ open, onOpenChange, project }: ProjectRatesDialogProps) {
  const { t } = useTranslation();
  const [developer, setDeveloper] = useState("");
  const [resource, setResource] = useState("");
  const [clearDeveloper, setClearDeveloper] = useState(false);
  const [clearResource, setClearResource] = useState(false);
  const [result, setResult] = useState<RatesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDeveloper("");
    setResource("");
    setClearDeveloper(false);
    setClearResource(false);
    setResult(null);
    setError(null);
  }, [open]);

  const body: { developerRate?: string | null; resourceRate?: string | null } = {};
  if (clearDeveloper) body.developerRate = null;
  else if (developer.trim() !== "") body.developerRate = developer.trim();
  if (clearResource) body.resourceRate = null;
  else if (resource.trim() !== "") body.resourceRate = resource.trim();
  const canSave = project !== null && Object.keys(body).length > 0;

  const save = async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      setResult(await tbFetch<RatesResult>(`/projects/${project.projectid}/rates`, { method: "PATCH", body }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.rates.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const shown = (v: string | null) => (v === null ? t("timeBilling.rates.companyDefault") : `$${v}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("timeBilling.rates.title")}</DialogTitle>
          <DialogDescription>{project?.name ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span>{t("timeBilling.settings.developerRate")}</span>
            <Input inputMode="decimal" value={developer} disabled={clearDeveloper} onChange={(e) => setDeveloper(e.target.value)} placeholder={t("timeBilling.rates.unchanged")} />
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={clearDeveloper} onCheckedChange={setClearDeveloper} />
            {t("timeBilling.rates.useDefault")}
          </label>
          <label className="flex flex-col gap-1">
            <span>{t("timeBilling.settings.resourceRate")}</span>
            <Input inputMode="decimal" value={resource} disabled={clearResource} onChange={(e) => setResource(e.target.value)} placeholder={t("timeBilling.rates.unchanged")} />
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={clearResource} onCheckedChange={setClearResource} />
            {t("timeBilling.rates.useDefault")}
          </label>
          <p className="text-xs text-slate-500">{t("timeBilling.rates.help")}</p>
          {result && (
            <p className="text-green-700" role="status">
              {t("timeBilling.rates.saved", { developer: shown(result.developerRate), resource: shown(result.resourceRate) })}
            </p>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("timeBilling.common.close")}
          </Button>
          <Button onClick={() => void save()} disabled={!canSave || saving}>
            {saving ? t("timeBilling.common.saving") : t("timeBilling.common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// [SCOPE 005 / T018] END
