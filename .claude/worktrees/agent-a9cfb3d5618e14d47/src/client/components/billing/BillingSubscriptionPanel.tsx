import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import StripePaymentForm from "../StripePaymentForm";
import { Loader2, CreditCard, AlertCircle, CheckCircle, RefreshCw, PauseCircle, PlayCircle, XCircle, Undo2 } from "lucide-react";
// [SCOPE 131 / T010] suspend & cancel block
import { useTranslation } from "../../i18n";
import { useAuth } from "../../context/AuthContext";
import CancelSubscriptionDialog from "./CancelSubscriptionDialog";

/**
 * Spec 023 Chunk H.5 — Settings → Billing tab content (admin only).
 *
 * Shows the company's current Stripe subscription id + status and lets an admin
 * re-enter their card to recover a failed/incomplete subscription, reusing the
 * registration StripePaymentForm against POST /api/payment/subscription/update-card.
 */

type Tier = "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

interface SubscribeResponse {
  success: boolean;
  clientSecret: string;
  /** Server-reported; the card-update path has no promo, so always "payment". */
  intentType: "payment" | "setup";
  customerId: string;
  subscriptionId: string;
  publishableKey: string;
  tier: Tier;
  monthlyPrice: number;
  promoDays: number;
  trialEnd: number | null;
  error?: string;
}

// [SCOPE 131 / T008] Live lifecycle state, returned alongside the summary so the
// panel renders all three states from one call. `subscriptionStatus` above comes
// from the JWT and can be a login-time snapshot; these fields are read from the row.
interface LifecycleState {
  subscriptionstatus: string;
  cancellationPending: boolean;
  cancelrequestedat: string | null;
  cancelledat: string | null;
  pausedat: string | null;
  paused: boolean;
  effectiveDate: string | null;
  manageable: boolean;
}

interface SubscriptionSummary {
  paymentsEnabled: boolean;
  billingPlan: string | null;
  subscriptionStatus: string | null;
  lifecycle?: LifecycleState;
  subscription: {
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    status: string;
    planName: string;
    planAmount: string;
    currentPeriodEnd: string | null;
    promoTrialDays: number | null;
  } | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-900/50 text-green-200",
  ACTIVE: "bg-green-900/50 text-green-200",
  incomplete: "bg-amber-900/50 text-amber-200",
  past_due: "bg-red-900/50 text-red-200",
  PENDING: "bg-amber-900/50 text-amber-200",
};

export function BillingSubscriptionPanel() {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const tierRef = useRef<Tier | null>(null);
  // [SCOPE 131 / T010] suspend / cancel state
  const { t, formatDate } = useTranslation();
  const { user } = useAuth();
  const [actionPending, setActionPending] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payment/subscription", { credentials: "include" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load subscription");
      }
      setSummary((await res.json()) as SubscriptionSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscription");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  // Drives StripePaymentForm against the update-card endpoint instead of registration.
  const initSubscription = useCallback(async (): Promise<SubscribeResponse> => {
    const res = await fetch("/api/payment/subscription/update-card", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const data = (await res.json()) as SubscribeResponse;
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to start card update");
    }
    tierRef.current = data.tier;
    return { ...data, promoDays: 0, trialEnd: null };
  }, []);

  const handleComplete = useCallback(
    async (result: { customerId: string; subscriptionId: string }) => {
      try {
        const res = await fetch("/api/payment/subscription/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: result.customerId,
            subscriptionId: result.subscriptionId,
            tier: tierRef.current,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to confirm payment");
        }
        setShowCardForm(false);
        setMessage({ type: "success", text: "Payment method updated — subscription reactivated." });
        await fetchSummary();
      } catch (err) {
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to confirm payment",
        });
      }
    },
    [fetchSummary],
  );

  // [SCOPE 131 / T010] BEGIN — suspend / cancel actions (FR-011)
  //
  // Every mutation re-fetches the summary rather than patching local state. The
  // server is the only place that knows what Stripe agreed to, and a panel that
  // optimistically renders "cancelled" after a call Stripe rejected is exactly
  // the divergence SPEC-131 exists to prevent.
  const runAction = useCallback(
    async (
      path: string,
      method: "POST" | "DELETE",
      successKey: string,
      body?: Record<string, unknown>,
    ) => {
      setActionPending(true);
      setMessage(null);
      try {
        const res = await fetch(path, {
          method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = (await res.json()) as {
          error?: string;
          data?: { effectiveDate?: string | null };
        };
        if (!res.ok) {
          // Surface the server's own refusal — "a cancellation is already
          // pending" is actionable, "something went wrong" is not.
          throw new Error(data.error ?? t("subscriptionLifecycle.actionFailed"));
        }
        const when = data.data?.effectiveDate
          ? formatDate(data.data.effectiveDate, { dateStyle: "long" })
          : t("subscriptionLifecycle.effectiveDateUnknown");
        setMessage({ type: "success", text: t(successKey, { date: when }) });
        setCancelDialogOpen(false);
        await fetchSummary();
      } catch (err) {
        setMessage({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : t("subscriptionLifecycle.actionFailed"),
        });
      } finally {
        setActionPending(false);
      }
    },
    [fetchSummary, formatDate, t],
  );
  // [SCOPE 131 / T010] END

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const sub = summary?.subscription ?? null;
  const planLabel = sub?.planName ?? summary?.billingPlan ?? "—";
  const status = sub?.status ?? summary?.subscriptionStatus ?? "unknown";

  // [SCOPE 131 / T010] Derived lifecycle view.
  //
  // `manageable` is the server's answer to "is there anything here to manage" —
  // false for a billing-exempt company and for one with no Stripe subscription.
  // Pairing it with the ADMIN check means the block appears only when every verb
  // in it would actually work.
  const lifecycle = summary?.lifecycle ?? null;
  const canManageLifecycle =
    (user?.usertype ?? "").toUpperCase() === "ADMIN" &&
    lifecycle?.manageable === true;

  // When a cancellation is pending the server tells us the date it takes effect.
  // Before that, the date a cancellation WOULD take effect is the current period
  // end — which is what the confirmation dialog has to quote, since the customer
  // is deciding whether to accept it.
  const periodEndIso = lifecycle?.effectiveDate ?? sub?.currentPeriodEnd ?? null;
  const effectiveDateLabel = periodEndIso
    ? formatDate(periodEndIso, { dateStyle: "long" })
    : t("subscriptionLifecycle.effectiveDateUnknown");

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-400" />
            Subscription &amp; Payment
          </CardTitle>
          <CardDescription className="text-slate-400">
            Review your current plan and update your card if a payment failed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-900/50 text-red-200">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
              <button onClick={() => void fetchSummary()} className="ml-auto underline">
                Retry
              </button>
            </div>
          )}

          {message && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                message.type === "success" ? "bg-green-900/50 text-green-200" : "bg-red-900/50 text-red-200"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Plan</p>
              <p className="text-white font-semibold mt-0.5">{planLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <span
                className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                  STATUS_STYLES[status] ?? "bg-slate-700 text-slate-300"
                }`}
              >
                {status}
              </span>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Stripe subscription id</p>
              <p className="text-slate-300 font-mono text-sm mt-0.5 break-all">
                {sub?.stripeSubscriptionId ?? "No subscription on file"}
              </p>
            </div>
          </div>

          {summary && !summary.paymentsEnabled && (
            <div className="p-3 rounded-lg text-sm bg-amber-900/40 text-amber-200">
              Credit-card processing is currently disabled, so the card cannot be updated right now.
            </div>
          )}

          {!showCardForm && summary?.paymentsEnabled && (
            <Button
              onClick={() => {
                setMessage(null);
                setShowCardForm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {sub ? "Update card / Re-activate subscription" : "Add a card / Subscribe"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* [SCOPE 131 / T010] BEGIN — suspend & cancel block (FR-011)
          Hidden, not disabled, when the caller is not an ADMIN or the company is
          billing-exempt. A disabled control still tells a team member that cancelling
          is a thing they nearly can do, and invites them to ask why it is greyed out;
          `manageable` is false for billing-exempt companies and for any company with
          no Stripe subscription, where none of these verbs mean anything. */}
      {canManageLifecycle && lifecycle && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">
              {t("subscriptionLifecycle.sectionTitle")}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {t("subscriptionLifecycle.sectionDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* State 1 of 3 — billing suspended. */}
            {lifecycle.paused && (
              <div className="rounded-lg bg-indigo-900/40 text-indigo-100 p-4 space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <PauseCircle className="h-4 w-4" />
                  {t("subscriptionLifecycle.statePaused")}
                </p>
                <p className="text-sm text-indigo-200/90">
                  {t("subscriptionLifecycle.statePausedDetail")}
                </p>
              </div>
            )}

            {/* State 2 of 3 — cancellation scheduled, access continues. */}
            {!lifecycle.paused && lifecycle.cancellationPending && (
              <div className="rounded-lg bg-amber-900/40 text-amber-100 p-4 space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {t("subscriptionLifecycle.stateCancelPending")}
                </p>
                <p className="text-sm text-amber-200/90">
                  {t("subscriptionLifecycle.stateCancelPendingDetail", {
                    date: effectiveDateLabel,
                  })}
                </p>
              </div>
            )}

            {/* State 3 of 3 — nothing pending. */}
            {!lifecycle.paused && !lifecycle.cancellationPending && (
              <p className="text-sm text-slate-300">
                {t("subscriptionLifecycle.stateActive")}
              </p>
            )}

            {!summary?.paymentsEnabled ? (
              <div className="p-3 rounded-lg text-sm bg-amber-900/40 text-amber-200">
                {t("subscriptionLifecycle.actionFailed")}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Suspend / resume. Not offered while a cancellation is pending:
                    the two are different intentions and stacking them produces a
                    state neither the customer nor Stripe can describe. */}
                {!lifecycle.cancellationPending && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-200">
                      {t("subscriptionLifecycle.pauseTitle")}
                    </p>
                    <p className="text-sm text-slate-400">
                      {t("subscriptionLifecycle.pauseDesc")}
                    </p>
                    {lifecycle.paused ? (
                      <Button
                        variant="secondary"
                        disabled={actionPending}
                        onClick={() =>
                          void runAction(
                            "/api/company/subscription/unpause",
                            "POST",
                            "subscriptionLifecycle.unpauseSuccess",
                          )
                        }
                      >
                        {actionPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="mr-2 h-4 w-4" />
                        )}
                        {t("subscriptionLifecycle.unpauseAction")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={actionPending}
                        onClick={() =>
                          void runAction(
                            "/api/company/subscription/pause",
                            "POST",
                            "subscriptionLifecycle.pauseSuccess",
                          )
                        }
                      >
                        {actionPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PauseCircle className="mr-2 h-4 w-4" />
                        )}
                        {t("subscriptionLifecycle.pauseAction")}
                      </Button>
                    )}
                  </div>
                )}

                {/* Cancel / un-cancel. Visually distinct from everything above —
                    this is the only action here that ends in data being archived. */}
                {!lifecycle.paused && (
                  <div className="space-y-2 pt-2 border-t border-slate-700">
                    <p className="text-sm font-medium text-slate-200">
                      {t("subscriptionLifecycle.cancelTitle")}
                    </p>
                    <p className="text-sm text-slate-400">
                      {t("subscriptionLifecycle.cancelDesc")}
                    </p>
                    {lifecycle.cancellationPending ? (
                      <Button
                        disabled={actionPending}
                        onClick={() =>
                          void runAction(
                            "/api/company/subscription/resume",
                            "POST",
                            "subscriptionLifecycle.undoCancelSuccess",
                          )
                        }
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {actionPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Undo2 className="mr-2 h-4 w-4" />
                        )}
                        {t("subscriptionLifecycle.undoCancelAction")}
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        disabled={actionPending}
                        onClick={() => {
                          setMessage(null);
                          setCancelDialogOpen(true);
                        }}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        {t("subscriptionLifecycle.cancelAction")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canManageLifecycle && (
        <CancelSubscriptionDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          companyName={user?.companyname ?? ""}
          effectiveDate={periodEndIso ? effectiveDateLabel : null}
          submitting={actionPending}
          onConfirm={(confirmName) =>
            void runAction(
              "/api/company/subscription",
              "DELETE",
              "subscriptionLifecycle.cancelSuccess",
              { confirmName },
            )
          }
        />
      )}
      {/* [SCOPE 131 / T010] END */}

      {showCardForm && summary?.paymentsEnabled && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <StripePaymentForm
              tier={(summary.billingPlan as Tier) ?? "SINGLE_USER"}
              billingEmail=""
              companyName=""
              initSubscription={initSubscription}
              onComplete={handleComplete}
              onBack={() => setShowCardForm(false)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default BillingSubscriptionPanel;
