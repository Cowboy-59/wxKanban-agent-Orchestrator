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
import { LegacySelect } from "../ui/Select";
import { apiFetchJson } from "../../lib/apiFetch";
import { useTranslation } from "../../i18n";

// Follows specs/119-consultant-customer-records/page.md § Create / edit form,
// which is the design of record for the pane this dialog opens from. Same shape
// as CustomerFormDialog on purpose: one column, no wizard, no sections.
//
// The native <select> (LegacySelect) is used rather than the composed Select in
// the same file. That Select renders its options as click-only <div>s with no
// role, no aria-expanded and no keyboard handling — unusable without a mouse.
// A credential form is the wrong place to ship that.

// Mirrors SYSTEM_TYPES in src/server/routes/consultantConnections.ts. The server
// rejects anything else, so this list and that one must not drift.
const SYSTEM_TYPES = ["jira", "monday", "trello", "asana", "azuredevops", "custom"] as const;
type SystemType = (typeof SYSTEM_TYPES)[number];

export interface ConnectionFormValues {
  name: string;
  systemtype: SystemType;
  apiendpoint: string;
  apitoken: string;
  accountemail: string;
  credentialscope: "PERSONAL" | "TEAM";
}

const EMPTY: ConnectionFormValues = {
  name: "",
  systemtype: "jira",
  apiendpoint: "",
  apitoken: "",
  accountemail: "",
  credentialscope: "PERSONAL",
};

// [SCOPE 017 / T071] BEGIN — create a connection, with credential scope selector (FR-007)
export function ConnectionFormDialog({
  open,
  customerId,
  onClose,
}: {
  open: boolean;
  customerId: string;
  onClose: (savedId?: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ConnectionFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setError(null);
    }
  }, [open]);

  const save = useMutation({
    mutationFn: async (v: ConnectionFormValues) => {
      // `credentials` is an opaque object to the server — it is JSON-stringified
      // and encrypted whole, never inspected. Keeping the token out of any other
      // field means one place to widen when a vendor needs more than a token.
      const credentials: Record<string, string> = { apitoken: v.apitoken.trim() };
      if (v.accountemail.trim()) credentials.accountemail = v.accountemail.trim();

      return apiFetchJson<{ connection: { id: string } }>(
        `/api/consultant/customers/${customerId}/connections`,
        {
          method: "POST",
          body: JSON.stringify({
            name: v.name.trim(),
            systemtype: v.systemtype,
            apiendpoint: v.apiendpoint.trim(),
            credentials,
            credentialscope: v.credentialscope,
          }),
        },
      );
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["customer-connections", customerId] });
      await queryClient.invalidateQueries({ queryKey: ["connection-health"] });
      onClose(data.connection.id);
    },
    onError: (err: unknown) => {
      // The server owns the rules — an archived customer, a bad endpoint and a
      // rejected scope all come back with a specific message worth reading.
      setError(err instanceof Error ? err.message : t("connections.saveFailed"));
    },
  });

  const nameInvalid = values.name.trim().length === 0;
  // Same test the server applies. Credentials travel to this URL, so plaintext
  // http is refused here too rather than round-tripping for a 400.
  const endpointInvalid = !/^https:\/\//i.test(values.apiendpoint.trim());
  const tokenInvalid = values.apitoken.trim().length === 0;
  const invalid = nameInvalid || endpointInvalid || tokenInvalid;

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-[36rem]">
        <DialogHeader>
          <DialogTitle>{t("connections.newTitle")}</DialogTitle>
          <DialogDescription>{t("connections.formHint")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            if (invalid) return;
            setError(null);
            save.mutate(values);
          }}
          className="space-y-3.5"
        >
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(14rem,100%),1fr))]">
            <div>
              <Label htmlFor="conn-name">
                {t("connections.nameField")} <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="conn-name"
                value={values.name}
                required
                aria-invalid={nameInvalid}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setValues((v) => ({ ...v, name: e.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="conn-system">
                {t("connections.systemType")} <span aria-hidden="true">*</span>
              </Label>
              <LegacySelect
                id="conn-system"
                value={values.systemtype}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setValues((v) => ({ ...v, systemtype: e.target.value as SystemType }))
                }
                className="mt-1.5"
              >
                {SYSTEM_TYPES.map((s: SystemType) => (
                  <option key={s} value={s}>
                    {t(`connections.systems.${s}`)}
                  </option>
                ))}
              </LegacySelect>
            </div>
          </div>

          <div>
            <Label htmlFor="conn-endpoint">
              {t("connections.apiEndpoint")} <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="conn-endpoint"
              value={values.apiendpoint}
              required
              inputMode="url"
              placeholder="https://"
              aria-invalid={endpointInvalid}
              aria-describedby="conn-endpoint-hint"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setValues((v) => ({ ...v, apiendpoint: e.target.value }))
              }
              className="mt-1.5"
            />
            <p id="conn-endpoint-hint" className="mt-1 text-xs text-muted-foreground">
              {t("connections.apiEndpointHint")}
            </p>
          </div>

          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(14rem,100%),1fr))]">
            <div>
              <Label htmlFor="conn-token">
                {t("connections.apiToken")} <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="conn-token"
                type="password"
                autoComplete="off"
                value={values.apitoken}
                required
                aria-invalid={tokenInvalid}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setValues((v) => ({ ...v, apitoken: e.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="conn-email">{t("connections.accountEmail")}</Label>
              <Input
                id="conn-email"
                type="email"
                autoComplete="off"
                value={values.accountemail}
                aria-describedby="conn-email-hint"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setValues((v) => ({ ...v, accountemail: e.target.value }))
                }
                className="mt-1.5"
              />
              <p id="conn-email-hint" className="mt-1 text-xs text-muted-foreground">
                {t("connections.accountEmailHint")}
              </p>
            </div>
          </div>

          {/* Scope is the one choice here with a security consequence, so it is
              stated as a consequence rather than as a label. Radios, not a
              select: both options and their costs stay visible at once. */}
          <fieldset className="rounded-md border border-border px-3 py-2.5">
            <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
              {t("connections.scopeLabel")}
            </legend>
            {(["PERSONAL", "TEAM"] as const).map((s) => (
              <label
                key={s}
                htmlFor={`conn-scope-${s}`}
                className="flex cursor-pointer items-start gap-2.5 py-1.5"
              >
                <input
                  id={`conn-scope-${s}`}
                  type="radio"
                  name="conn-scope"
                  value={s}
                  checked={values.credentialscope === s}
                  onChange={() => setValues((v) => ({ ...v, credentialscope: s }))}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]"
                />
                <span className="text-[13px]">
                  <span className="font-medium">{t(`connections.scope.${s}`)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`connections.scopeHint.${s}`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <p className="text-xs text-muted-foreground">{t("connections.afterSaveHint")}</p>

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
            <Button type="submit" disabled={invalid || save.isPending}>
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
// [SCOPE 017 / T071] END
