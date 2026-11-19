import React, { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJS } from "@stripe/stripe-js";
import { useTranslation } from "../i18n"; // [SCOPE 052]

/**
 * PCI-compliant Stripe payment form (spec 023 FR-001 + FR-002).
 *
 * Flow:
 * 1. Parent renders <StripePaymentForm /> with the registering company/tier info.
 * 2. On mount the form calls POST /api/payment/registration/subscribe, which
 *    creates a Stripe Customer + incomplete Subscription and returns a
 *    PaymentIntent `client_secret`.
 * 3. The <Elements /> provider + <PaymentElement /> collect the card. Stripe.js
 *    posts card details directly to Stripe — they never touch wxKanban servers.
 * 4. stripe.confirmPayment() confirms the PaymentIntent. On success we hand the
 *    customer/subscription IDs back to the parent so the final
 *    /api/auth/register call can persist the link.
 */

type Tier = "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

interface StripePaymentFormProps {
  tier: Tier;
  billingEmail: string;
  companyName: string;
  /**
   * [SCOPE 023 / T109] Signup-invitation token (FR-002a). Replaces the old
   * `promoDaysOverride`, which let the client dictate its own promo length.
   * Opaque here: the server resolves the promo days and plan it confers.
   */
  inviteToken?: string;
  onComplete: (result: {
    customerId: string;
    subscriptionId: string;
    appliedPromoDays: number;
  }) => void;
  onBack: () => void;
  /**
   * Spec 023 Chunk H.4 — optional override for how the subscription/PaymentIntent
   * is created. Defaults to the registration endpoint. The Billing tab passes a
   * function that hits POST /api/payment/subscription/update-card instead, so the
   * same card UI drives a post-signup card update / re-subscribe.
   */
  initSubscription?: () => Promise<SubscribeResponse>;
}

interface SubscribeResponse {
  success: boolean;
  clientSecret: string;
  /**
   * Which Stripe.js confirm call this clientSecret needs. A promo/trial
   * subscription bills $0 today, so Stripe issues a SetupIntent rather than a
   * PaymentIntent — and confirmPayment() errors against a SetupIntent secret.
   * Server-derived; never infer it from promoDays.
   */
  intentType: "payment" | "setup";
  customerId: string;
  subscriptionId: string;
  publishableKey: string;
  tier: Tier;
  monthlyPrice: number;
  promoDays: number;
  /** Unix seconds when the promo ends and the first real charge lands. */
  trialEnd: number | null;
  error?: string;
}

const tierKey: Record<Tier, string> = {
  SINGLE_USER: "register.tierSingleUser",
  SMALL_BUSINESS: "register.tierSmallBusiness",
  CONSULTANT: "register.tierConsultant",
  ENTERPRISE: "register.tierEnterprise",
};

const StripePaymentForm: React.FC<StripePaymentFormProps> = ({
  tier,
  billingEmail,
  companyName,
  inviteToken,
  onComplete,
  onBack,
  initSubscription,
}) => {
  const { t } = useTranslation();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [subscribeMeta, setSubscribeMeta] = useState<SubscribeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = initSubscription
          ? await initSubscription()
          : await (async () => {
              const response = await fetch("/api/payment/registration/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subscriptionTier: tier,
                  billingEmail,
                  companyName,
                  ...(inviteToken ? { inviteToken } : {}),
                }),
              });

              const body = (await response.json()) as SubscribeResponse;
              if (!response.ok) {
                throw new Error(body.error ?? t("register.initPaymentError"));
              }
              return body;
            })();

        if (!cancelled) {
          setClientSecret(data.clientSecret);
          setPublishableKey(data.publishableKey);
          setSubscribeMeta(data);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t("register.initPaymentError"));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tier, billingEmail, companyName, inviteToken, initSubscription]);

  const stripePromise = useMemo<Promise<StripeJS | null> | null>(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);

  if (loadError) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("register.paymentMethod")}</h2>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-300">{loadError}</p>
        </div>
        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={onBack}
            className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 font-semibold py-2 px-8 rounded-lg transition"
          >
            {t("register.back")}
          </button>
        </div>
      </div>
    );
  }

  if (!clientSecret || !stripePromise || !subscribeMeta) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600 dark:text-slate-400 text-sm">{t("register.preparingPayment")}</p>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: "stripe" },
      }}
    >
      <InnerForm
        subscribeMeta={subscribeMeta}
        tier={tier}
        onComplete={onComplete}
        onBack={onBack}
      />
    </Elements>
  );
};

interface InnerFormProps {
  subscribeMeta: SubscribeResponse;
  tier: Tier;
  onComplete: StripePaymentFormProps["onComplete"];
  onBack: () => void;
}

const InnerForm: React.FC<InnerFormProps> = ({
  subscribeMeta,
  tier,
  onComplete,
  onBack,
}) => {
  const { t, formatDate } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // A promo subscription charges nothing today: Stripe hands back a SetupIntent
  // that authorises the card for the first real charge at promo end.
  const isPromo = subscribeMeta.promoDays > 0;
  const firstChargeDate =
    subscribeMeta.trialEnd !== null
      ? formatDate(subscribeMeta.trialEnd * 1000, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // confirmSetup and confirmPayment are not interchangeable — each rejects
      // the other's client_secret. Follow the server's discriminator.
      const { error } =
        subscribeMeta.intentType === "setup"
          ? await stripe.confirmSetup({ elements, redirect: "if_required" })
          : await stripe.confirmPayment({ elements, redirect: "if_required" });

      if (error) {
        setSubmitError(error.message ?? t("register.paymentFailedCard"));
        return;
      }

      onComplete({
        customerId: subscribeMeta.customerId,
        subscriptionId: subscribeMeta.subscriptionId,
        appliedPromoDays: subscribeMeta.promoDays,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("register.paymentFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("register.paymentMethod")}</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          {t("register.subscribingTo")} <strong>{t(tierKey[tier])}</strong> {t("register.at")} <strong>${subscribeMeta.monthlyPrice.toFixed(2)}{t("register.perMonth")}</strong>.
        </p>
      </div>

      {isPromo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-900 dark:text-blue-200">
          <p className="font-semibold">
            {t("register.promoFreeForDays", { days: subscribeMeta.promoDays })}
          </p>
          <p className="mt-1">
            {firstChargeDate
              ? t("register.promoFirstChargeOn", {
                  amount: `$${subscribeMeta.monthlyPrice.toFixed(2)}`,
                  date: firstChargeDate,
                })
              : t("register.promoFirstChargeAfter", {
                  amount: `$${subscribeMeta.monthlyPrice.toFixed(2)}`,
                  days: subscribeMeta.promoDays,
                })}
          </p>
          <p className="mt-1">{t("register.promoCardNotChargedToday")}</p>
        </div>
      )}

      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-900 dark:text-green-200 flex items-start">
        <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 016 0v1a1 1 0 11-2 0V7a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <span>{t("register.stripeNotice")}</span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <PaymentElement />
      </div>

      {submitError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-800 dark:text-red-300">{submitError}</p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 font-semibold py-2 px-8 rounded-lg transition disabled:opacity-50"
        >
          {t("register.back")}
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || submitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-8 rounded-lg transition"
        >
          {submitting
            ? t("register.processing")
            : isPromo
              ? t("register.startPromo")
              : t("register.completePayment")}
        </button>
      </div>
    </form>
  );
};

export default StripePaymentForm;
