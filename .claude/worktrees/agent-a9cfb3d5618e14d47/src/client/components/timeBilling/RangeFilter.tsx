import { Button } from "~/client/components/ui/Button";
import { Input } from "~/client/components/ui/Input";
import { Switch } from "~/client/components/ui/Switch";
import { useTranslation } from "~/client/i18n";
import { weekOf, type DateRange } from "./api";

// [SCOPE 005 / T015] BEGIN — RangeFilter: date range (default current week) and include-invoiced toggle (FR-004)
interface RangeFilterProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

export function RangeFilter({ value, onChange }: RangeFilterProps) {
  const { t } = useTranslation();
  const valid = value.from <= value.to;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-300">{t("timeBilling.range.from")}</span>
        <Input
          type="date"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="w-40"
          aria-invalid={!valid}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-300">{t("timeBilling.range.to")}</span>
        <Input
          type="date"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="w-40"
          aria-invalid={!valid}
        />
      </label>
      <Button variant="outline" onClick={() => onChange({ ...value, ...weekOf(new Date()) })}>
        {t("timeBilling.range.thisWeek")}
      </Button>
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 pb-2">
        <Switch
          checked={value.includeInvoiced}
          onCheckedChange={(checked) => onChange({ ...value, includeInvoiced: checked })}
          aria-label={t("timeBilling.range.includeInvoiced")}
        />
        {t("timeBilling.range.includeInvoiced")}
      </label>
      {!valid && <p className="text-sm text-red-600 pb-2">{t("timeBilling.range.invalid")}</p>}
    </div>
  );
}
// [SCOPE 005 / T015] END
