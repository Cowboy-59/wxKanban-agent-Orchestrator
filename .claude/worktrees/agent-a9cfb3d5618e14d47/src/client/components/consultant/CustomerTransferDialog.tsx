import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { apiFetchJson } from "../../lib/apiFetch";
import { useTranslation } from "../../i18n";

// Design of record: specs/119-consultant-customer-records/page.md § Transfer dialog.
//
// This exists because `customers.consultantid` is ON DELETE RESTRICT (SPEC-119
// Clarification 6). RESTRICT stops a departing consultant's deletion from
// destroying billing history, but it also makes offboarding impossible until
// their customers move. This dialog is the way out.

interface CompanyUser {
  id: string;
  email: string;
  fullname: string | null;
  usertype: string;
}

// [SCOPE 119 / T017] BEGIN — transfer customer ownership (FR-011)
export function CustomerTransferDialog({
  open,
  customerId,
  customerName,
  currentOwnerId,
  onClose,
}: {
  open: boolean;
  customerId: string | null;
  customerName: string;
  currentOwnerId: string | null;
  onClose: (transferred?: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [toId, setToId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["company-users"],
    queryFn: () => apiFetchJson<{ users: CompanyUser[] }>("/api/team/company/users"),
    enabled: open,
  });

  // Never offer the current owner as a destination — the server rejects it, and
  // an option that always errors is a bug the UI should not surface.
  const candidates: CompanyUser[] = (usersQuery.data?.users ?? []).filter(
    (u: CompanyUser) => u.id !== currentOwnerId,
  );

  const transfer = useMutation({
    mutationFn: () =>
      apiFetchJson(`/api/consultant/customers/${customerId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ toconsultantid: toId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["consultant-customers"] });
      await queryClient.invalidateQueries({ queryKey: ["consultant-customer"] });
      onClose(true);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : t("customers.transferFailed"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>{t("customers.transferTitle")}</DialogTitle>
          <DialogDescription>
            {t("customers.transferBody", { name: customerName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div>
            <Label htmlFor="transfer-to">{t("customers.transferTo")}</Label>
            <select
              id="transfer-to"
              value={toId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setToId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">{t("customers.transferChoose")}</option>
              {candidates.map((u: CompanyUser) => (
                <option key={u.id} value={u.id}>
                  {u.fullname ? `${u.fullname} · ${u.email}` : u.email}
                </option>
              ))}
            </select>
          </div>

          {/* What transfers and what does not — stated, because "transfer" could
              plausibly mean the projects move too, and they do not. */}
          <div className="rounded-md border border-border bg-muted/45 px-3.5 py-3">
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t("customers.transferNote")}</span>
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.1)] px-3 py-2 text-[13px] text-[hsl(var(--danger))]"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!toId || transfer.isPending}
            onClick={() => {
              setError(null);
              transfer.mutate();
            }}
          >
            {transfer.isPending ? t("customers.transferring") : t("customers.transferConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// [SCOPE 119 / T017] END
