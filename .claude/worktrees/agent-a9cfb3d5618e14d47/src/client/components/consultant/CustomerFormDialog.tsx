import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Textarea } from "../ui/Textarea";
import { apiFetchJson } from "../../lib/apiFetch";
import { useTranslation } from "../../i18n";

// Design of record: specs/119-consultant-customer-records/page.md § Create / edit form.
//
// Six fields, one required. Deliberately NOT a wizard and not sectioned — a
// consultant adding a client is doing data entry, and every extra step is a
// reason to put it off and lose the record entirely.

export interface CustomerFormValues {
  id?: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  billingaddress: string;
  taxid: string;
}

const EMPTY: CustomerFormValues = {
  name: "",
  company: "",
  email: "",
  phone: "",
  billingaddress: "",
  taxid: "",
};

// [SCOPE 119 / T016] BEGIN — create/edit a customer (FR-001)
export function CustomerFormDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial?: CustomerFormValues | null;
  onClose: (savedId?: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CustomerFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (open) {
      setValues(initial ? { ...EMPTY, ...initial } : EMPTY);
      setError(null);
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async (v: CustomerFormValues) => {
      // Only the six editable fields travel. `clientcompanyid` is deliberately
      // absent — the tenant link has its own endpoints, which carry the
      // engagement check (SPEC-119 FR-004). PATCH rejects it outright.
      const body = {
        name: v.name.trim(),
        company: v.company || null,
        email: v.email || null,
        phone: v.phone || null,
        billingaddress: v.billingaddress || null,
        taxid: v.taxid || null,
      };
      return isEdit
        ? apiFetchJson<{ customer: { id: string } }>(
            `/api/consultant/customers/${initial?.id}`,
            { method: "PATCH", body: JSON.stringify(body) },
          )
        : apiFetchJson<{ customer: { id: string } }>("/api/consultant/customers", {
            method: "POST",
            body: JSON.stringify(body),
          });
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["consultant-customers"] });
      await queryClient.invalidateQueries({ queryKey: ["consultant-customer"] });
      onClose(data.customer.id);
    },
    onError: (err: unknown) => {
      // The server owns the rules. Surfacing its message verbatim keeps the
      // duplicate-name case (409) readable instead of "something went wrong".
      setError(err instanceof Error ? err.message : t("customers.saveFailed"));
    },
  });

  const nameInvalid = values.name.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-[36rem]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("customers.editTitle") : t("customers.newTitle")}
          </DialogTitle>
          <DialogDescription>{t("customers.formHint")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            if (nameInvalid) return;
            setError(null);
            save.mutate(values);
          }}
          className="space-y-3.5"
        >
          <div>
            <Label htmlFor="cust-name">
              {t("customers.name")} <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="cust-name"
              value={values.name}
              required
              aria-invalid={nameInvalid}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setValues((v) => ({ ...v, name: e.target.value }))
              }
              className="mt-1.5"
            />
          </div>

          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(14rem,100%),1fr))]">
            <div>
              <Label htmlFor="cust-company">{t("customers.companyField")}</Label>
              <Input
                id="cust-company"
                value={values.company}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setValues((v) => ({ ...v, company: e.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cust-email">{t("customers.email")}</Label>
              <Input
                id="cust-email"
                type="email"
                value={values.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setValues((v) => ({ ...v, email: e.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cust-phone">{t("customers.phone")}</Label>
              <Input
                id="cust-phone"
                value={values.phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setValues((v) => ({ ...v, phone: e.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cust-taxid">{t("customers.taxid")}</Label>
              <Input
                id="cust-taxid"
                value={values.taxid}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setValues((v) => ({ ...v, taxid: e.target.value }))
                }
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cust-address">{t("customers.billingaddress")}</Label>
            <Textarea
              id="cust-address"
              rows={3}
              value={values.billingaddress}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setValues((v) => ({ ...v, billingaddress: e.target.value }))
              }
              className="mt-1.5"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.1)] px-3 py-2 text-[13px] text-[hsl(var(--danger))]"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose()}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={nameInvalid || save.isPending}>
              {save.isPending ? t("customers.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
// [SCOPE 119 / T016] END
