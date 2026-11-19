import { useCallback, useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { Button } from "~/client/components/ui/Button";
import { Input } from "~/client/components/ui/Input";
import { useTranslation } from "~/client/i18n";
import { tbFetch, TimeBillingApiError } from "./api";

// [SCOPE 005 / T018] BEGIN — TimeBillingSettings: company rates and ACH details, a section of Settings (FR-008, FR-012)
interface SettingsView {
  developerRate: string;
  resourceRate: string;
  ach: {
    bankname: string | null;
    routingnumberlast4: string | null;
    accountnumberlast4: string | null;
    accountname: string | null;
    complete: boolean;
  };
}

type AchField = "bankname" | "routingnumber" | "accountnumber" | "accountname";

/**
 * Rates and ACH details. Routing and account numbers are never sent back by the server: the
 * screen shows the last 4 digits, and a field is only sent when the ADMIN types a new value,
 * so saving the rates never touches the stored bank details (FR-012).
 */
export function TimeBillingSettings() {
  const { t } = useTranslation();
  const [view, setView] = useState<SettingsView | null>(null);
  const [developerRate, setDeveloperRate] = useState("");
  const [resourceRate, setResourceRate] = useState("");
  const [ach, setAch] = useState<Record<AchField, string>>({ bankname: "", routingnumber: "", accountnumber: "", accountname: "" });
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const apply = (v: SettingsView) => {
    setView(v);
    setDeveloperRate(v.developerRate);
    setResourceRate(v.resourceRate);
    setAch({ bankname: v.ach.bankname ?? "", routingnumber: "", accountnumber: "", accountname: v.ach.accountname ?? "" });
  };

  const load = useCallback(async () => {
    try {
      apply(await tbFetch<SettingsView>("/settings"));
    } catch (err) {
      if (err instanceof TimeBillingApiError && err.status === 403) setForbidden(true);
      else setStatus({ kind: "error", text: err instanceof Error ? err.message : t("timeBilling.settings.loadFailed") });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Non-ADMIN or a plan without Time & Billing: the server refused; show nothing here.
  if (forbidden) return null;
  if (!view) return <p className="text-sm text-slate-500">{t("timeBilling.common.loading")}</p>;

  const save = async () => {
    const body: { developerRate?: string; resourceRate?: string; ach?: Partial<Record<AchField, string | null>> } = {};
    if (developerRate !== view.developerRate) body.developerRate = developerRate.trim();
    if (resourceRate !== view.resourceRate) body.resourceRate = resourceRate.trim();
    const achPatch: Partial<Record<AchField, string | null>> = {};
    if (ach.bankname !== (view.ach.bankname ?? "")) achPatch.bankname = ach.bankname.trim() === "" ? null : ach.bankname.trim();
    if (ach.accountname !== (view.ach.accountname ?? "")) achPatch.accountname = ach.accountname.trim() === "" ? null : ach.accountname.trim();
    if (ach.routingnumber.trim() !== "") achPatch.routingnumber = ach.routingnumber.trim();
    if (ach.accountnumber.trim() !== "") achPatch.accountnumber = ach.accountnumber.trim();
    if (Object.keys(achPatch).length > 0) body.ach = achPatch;
    if (Object.keys(body).length === 0) {
      setStatus({ kind: "ok", text: t("timeBilling.settings.nothingChanged") });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      apply(await tbFetch<SettingsView>("/settings", { method: "PUT", body }));
      setStatus({ kind: "ok", text: t("timeBilling.settings.saved") });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : t("timeBilling.settings.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  const masked = (last4: string | null) =>
    last4 ? t("timeBilling.settings.endingIn", { last4 }) : t("timeBilling.settings.notSet");

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t("timeBilling.settings.title")}</h3>
        <p className="text-sm text-slate-500">{t("timeBilling.settings.description")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t("timeBilling.settings.developerRate")}</span>
          <Input inputMode="decimal" value={developerRate} onChange={(e) => setDeveloperRate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t("timeBilling.settings.resourceRate")}</span>
          <Input inputMode="decimal" value={resourceRate} onChange={(e) => setResourceRate(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-slate-500">{t("timeBilling.settings.ratesHelp")}</p>

      <div className="flex flex-col gap-3">
        <h4 className="flex items-center gap-2 font-medium">
          <Landmark className="w-4 h-4" />
          {t("timeBilling.settings.achTitle")}
          <span className={`text-xs ${view.ach.complete ? "text-green-700" : "text-amber-700"}`}>
            {view.ach.complete ? t("timeBilling.settings.achComplete") : t("timeBilling.settings.achIncomplete")}
          </span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("timeBilling.settings.bankName")}</span>
            <Input value={ach.bankname} onChange={(e) => setAch({ ...ach, bankname: e.target.value })} maxLength={200} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("timeBilling.settings.accountName")}</span>
            <Input value={ach.accountname} onChange={(e) => setAch({ ...ach, accountname: e.target.value })} maxLength={200} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              {t("timeBilling.settings.routingNumber")}{" "}
              <span className="text-xs text-slate-500">({masked(view.ach.routingnumberlast4)})</span>
            </span>
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={ach.routingnumber}
              onChange={(e) => setAch({ ...ach, routingnumber: e.target.value })}
              placeholder={t("timeBilling.settings.replacePlaceholder")}
              maxLength={9}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              {t("timeBilling.settings.accountNumber")}{" "}
              <span className="text-xs text-slate-500">({masked(view.ach.accountnumberlast4)})</span>
            </span>
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={ach.accountnumber}
              onChange={(e) => setAch({ ...ach, accountnumber: e.target.value })}
              placeholder={t("timeBilling.settings.replacePlaceholder")}
              maxLength={17}
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">{t("timeBilling.settings.achHelp")}</p>
      </div>

      {status && (
        <p className={`text-sm ${status.kind === "ok" ? "text-green-700" : "text-red-600"}`} role="status">
          {status.text}
        </p>
      )}
      <div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? t("timeBilling.common.saving") : t("timeBilling.common.save")}
        </Button>
      </div>
    </section>
  );
}
// [SCOPE 005 / T018] END
