// [SCOPE 131 / T011] BEGIN — typed-confirmation cancellation dialog (FR-011)
/**
 * SPEC-131 T011. The confirmation step in front of `DELETE /api/company/subscription`.
 *
 * The typed company name is a UX affordance, not a control: the same check runs
 * on the server before Stripe is contacted (T002), and this dialog deliberately
 * mirrors it rather than replacing it. Everything here could be bypassed with
 * curl, and the server would still refuse.
 *
 * The comparison is trimmed and case-insensitive, matching the server exactly. A
 * stricter client check than the server's would reject a confirmation the API
 * would have accepted, which reads as a broken dialog.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import { useTranslation } from "../../i18n";

/**
 * [SCOPE 131 / T011] MODIFIED-BY — copy overrides for the operator surface.
 *
 * The default strings are written in the customer's voice ("You keep full access
 * until…"), which is correct on Settings → Billing and wrong on the SYSADMIN
 * company console, where the operator is cancelling on behalf of a company that
 * is not theirs. Rather than fork the dialog — and end up with two typed-name
 * gates that can drift apart — each line of copy can be replaced by the caller.
 * Anything left out falls back to the customer wording, so the original caller
 * is unchanged.
 */
export interface CancelSubscriptionDialogCopy {
  title?: string;
  body?: string;
  undoNote?: string;
  typeLabel?: string;
  placeholder?: string;
  mismatch?: string;
  keep?: string;
  confirm?: string;
}

interface CancelSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  /** Formatted date access ends, or null when it could not be resolved. */
  effectiveDate: string | null;
  submitting: boolean;
  onConfirm: (confirmName: string) => void;
  /** Per-surface wording. Omitted keys keep the customer-voiced defaults. */
  copy?: CancelSubscriptionDialogCopy;
}

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  companyName,
  effectiveDate,
  submitting,
  onConfirm,
  copy,
}: CancelSubscriptionDialogProps) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");

  // Clear the field whenever the dialog opens. Leaving the previous value would
  // mean a second cancel click arrives pre-confirmed, which defeats the point.
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const matches =
    typed.trim().toLowerCase() === companyName.trim().toLowerCase();
  const showMismatch = typed.length > 0 && !matches;
  // Null when the period end could not be resolved — say so in words rather than
  // showing an empty gap where a date belongs in a destructive confirmation.
  const dateLabel = effectiveDate ?? t("subscriptionLifecycle.effectiveDateUnknown");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            {copy?.title ?? t("subscriptionLifecycle.dialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {copy?.body ?? t("subscriptionLifecycle.dialogBody", { date: dateLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-400">
            {copy?.undoNote ?? t("subscriptionLifecycle.dialogUndoNote", { date: dateLabel })}
          </p>

          <div className="space-y-2">
            <label
              htmlFor="cancel-confirm-name"
              className="block text-sm font-medium text-slate-300"
            >
              {copy?.typeLabel ?? t("subscriptionLifecycle.dialogTypeLabel", { name: companyName })}
            </label>
            <Input
              id="cancel-confirm-name"
              value={typed}
              autoComplete="off"
              disabled={submitting}
              placeholder={copy?.placeholder ?? t("subscriptionLifecycle.dialogPlaceholder")}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={showMismatch}
            />
            {showMismatch && (
              <p className="text-sm text-red-400">
                {copy?.mismatch ?? t("subscriptionLifecycle.dialogMismatch")}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {copy?.keep ?? t("subscriptionLifecycle.dialogKeep")}
          </Button>
          <Button
            // Stays disabled until the name matches — the destructive action is
            // never one stray click away.
            variant="destructive"
            disabled={!matches || submitting}
            onClick={() => onConfirm(typed.trim())}
            className="disabled:opacity-50"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {copy?.confirm ?? t("subscriptionLifecycle.dialogConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CancelSubscriptionDialog;
// [SCOPE 131 / T011] END
