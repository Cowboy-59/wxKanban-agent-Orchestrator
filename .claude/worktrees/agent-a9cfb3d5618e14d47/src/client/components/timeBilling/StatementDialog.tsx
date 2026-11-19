import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/client/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/client/components/ui/Dialog";
import { Input } from "~/client/components/ui/Input";
import { useTranslation } from "~/client/i18n";
import { downloadStatementPdf, tbFetch, todayIso, type TimeBillingCustomer } from "./api";

// [SCOPE 005 / T017] BEGIN — StatementDialog: Customer, period from billing cycle, generate and download (FR-009)
interface StatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: TimeBillingCustomer[];
  onGenerated: () => void;
  onCustomersChanged: () => void;
}

interface StatementResult {
  statementid: string;
  invoicenumber: string;
  total: number;
  entrycount: number;
}

type BillingCycle = "weekly" | "biweekly";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function StatementDialog(props: StatementDialogProps) {
  const { t } = useTranslation();
  const { open, customers, onGenerated, onCustomersChanged } = props;

  const [customerid, setCustomerid] = useState("");
  const [periodstart, setPeriodstart] = useState("");
  const [periodend, setPeriodend] = useState("");
  const [result, setResult] = useState<StatementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  const customer = customers.find((c) => c.id === customerid) ?? null;
  const cycle: BillingCycle | null = customer ? customer.billingcycle : null;

  // Latest values for effects that must not re-run when these change.
  const customersRef = useRef(customers);
  customersRef.current = customers;
  const tRef = useRef(t);
  tRef.current = t;

  // Reset on open; default to the first Customer.
  useEffect(() => {
    if (!open) return;
    const list = customersRef.current;
    setCustomerid((current) => (list.some((c) => c.id === current) ? current : (list[0]?.id ?? "")));
    setResult(null);
    setError(null);
  }, [open]);

  // Suggested period whenever the Customer or its cycle changes.
  useEffect(() => {
    if (!open || customerid === "") return;
    let cancelled = false;
    setLoadingPeriod(true);
    tbFetch<{ periodstart: string; periodend: string }>(
      `/statements/period?customerid=${encodeURIComponent(customerid)}&today=${todayIso()}`,
    )
      .then((p) => {
        if (cancelled) return;
        setPeriodstart(p.periodstart);
        setPeriodend(p.periodend);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : tRef.current("timeBilling.statement.periodFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoadingPeriod(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customerid, cycle]);

  const changeCustomer = useCallback((id: string) => {
    setCustomerid(id);
    setResult(null);
    setError(null);
  }, []);

  const changeCycle = async (next: BillingCycle) => {
    if (!customer || next === customer.billingcycle) return;
    setBusy(true);
    setError(null);
    try {
      await tbFetch(`/customers/${customer.id}/billingcycle`, { method: "PATCH", body: { billingcycle: next } });
      onCustomersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.statement.cycleFailed"));
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!customer) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const created = await tbFetch<StatementResult>("/statements", {
        method: "POST",
        body: { customerid: customer.id, periodstart, periodend },
      });
      setResult(created);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.statement.generateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      await downloadStatementPdf(result.statementid, `${result.invoicenumber}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.statement.downloadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const canGenerate =
    customer !== null && periodstart !== "" && periodend !== "" && periodstart <= periodend && !busy && !loadingPeriod;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("timeBilling.statement.title")}</DialogTitle>
          <DialogDescription>{t("timeBilling.statement.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("timeBilling.statement.customer")}</span>
            <select
              className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-background text-foreground px-3"
              value={customerid}
              onChange={(e) => changeCustomer(e.target.value)}
              disabled={busy}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {customer && customer.billedProjects === 0 && (
            <p className="text-sm text-amber-700">{t("timeBilling.statement.noBilledProjects")}</p>
          )}

          {customer && (
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("timeBilling.statement.cycle")}</span>
              <select
                className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-background text-foreground px-3"
                value={customer.billingcycle}
                onChange={(e) => void changeCycle(e.target.value === "biweekly" ? "biweekly" : "weekly")}
                disabled={busy}
              >
                <option value="weekly">{t("timeBilling.statement.cycleWeekly")}</option>
                <option value="biweekly">{t("timeBilling.statement.cycleBiweekly")}</option>
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("timeBilling.statement.periodStart")}</span>
              <Input
                type="date"
                value={periodstart}
                onChange={(e) => {
                  setPeriodstart(e.target.value);
                  setResult(null);
                }}
                disabled={busy || loadingPeriod}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("timeBilling.statement.periodEnd")}</span>
              <Input
                type="date"
                value={periodend}
                onChange={(e) => {
                  setPeriodend(e.target.value);
                  setResult(null);
                }}
                disabled={busy || loadingPeriod}
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {loadingPeriod ? t("timeBilling.common.loading") : t("timeBilling.statement.periodNote")}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {result && (
            <div className="rounded-md border border-slate-300 dark:border-slate-600 p-3 text-sm flex flex-col gap-2">
              <p className="font-medium">{t("timeBilling.statement.created", { name: result.invoicenumber })}</p>
              <dl className="grid grid-cols-2 gap-1">
                <dt className="text-slate-500">{t("timeBilling.statement.number")}</dt>
                <dd>{result.invoicenumber}</dd>
                <dt className="text-slate-500">{t("timeBilling.statement.total")}</dt>
                <dd>{formatMoney(result.total)}</dd>
                <dt className="text-slate-500">{t("timeBilling.statement.entries")}</dt>
                <dd>{result.entrycount}</dd>
              </dl>
              <div>
                <Button variant="outline" onClick={() => void download()} disabled={busy}>
                  {t("timeBilling.statement.downloadPdf")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("timeBilling.common.cancel")}
          </Button>
          <Button onClick={() => void generate()} disabled={!canGenerate}>
            {busy ? t("timeBilling.statement.working") : t("timeBilling.statement.generate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// [SCOPE 005 / T017] END
