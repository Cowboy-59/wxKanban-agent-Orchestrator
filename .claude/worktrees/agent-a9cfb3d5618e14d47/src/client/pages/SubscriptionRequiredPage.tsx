import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { evaluateAccess } from "../../shared/subscription-policy";
import StripePaymentForm from "../components/StripePaymentForm";
import { useTranslation } from "../i18n"; // [SCOPE 131 / T012]

// [SCOPE 090 / T007] BEGIN — subscription wall (Amendment A, FR-008)
// [SCOPE 131 / T012] MODIFIED-BY — a fourth mode, 'resume-subscription', for a company that suspended its own billing, plus paused-specific copy for its team members. Both are driven by the policy's decision, not by a status compared here.
/**
 * SPEC-090 Amendment A FR-008. The screen a blocked company lands on. It is a
 * working surface, not a notice: an admin picks a plan and pays here, inline,
 * rather than being told to go somewhere else.
 *
 * Three modes, decided by the shared policy (never re-derived locally):
 *   pick-plan     no usable subscription → plan picker, then Stripe Elements
 *   update-card   card failed on an existing subscription → billing portal, so
 *                 the admin repairs the subscription they have instead of
 *                 opening a second one against the same company
 *   contact-admin blocked, but this user cannot pay — every payment route is
 *                 admin-only — so name the person who can
 *
 * Sign-out stays reachable in all three: a walled user must never be trapped.
 */

type PaidTier = "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

const TIERS: Array<{ tier: PaidTier; label: string; price: string; blurb: string }> = [
  { tier: "SINGLE_USER", label: "Single User", price: "$19.95", blurb: "1 user" },
  { tier: "SMALL_BUSINESS", label: "Small Business", price: "$29.95", blurb: "Small team" },
  { tier: "CONSULTANT", label: "Consultant", price: "$39.95", blurb: "Client work" },
  { tier: "ENTERPRISE", label: "Enterprise", price: "$59.95", blurb: "Larger teams" },
];

const CARD =
  "bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm";

export default function SubscriptionRequiredPage() {
  const { user, logout } = useAuth();
  const { t } = useTranslation(); // [SCOPE 131 / T012]

  const access = evaluateAccess({
    subscriptionstatus: user?.subscriptionstatus,
    activeflag: user?.companyactiveflag,
    billingexempt: user?.billingexempt,
    usertype: user?.usertype,
  });

  const currentTier = TIERS.some((t) => t.tier === user?.billingplan)
    ? (user?.billingplan as PaidTier)
    : "SINGLE_USER";

  const [selectedTier, setSelectedTier] = useState<PaidTier>(currentTier);
  const [payingNow, setPayingNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tierRef = React.useRef<PaidTier>(currentTier);

  const signOut = (
    <button
      onClick={() => void logout()}
      className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
    >
      Sign out
    </button>
  );

  // Persist the chosen plan first, then start the card flow. The Stripe path
  // reads the tier from the company row rather than trusting the client, so the
  // selection has to land server-side before a card is collected.
  const initSubscription = async () => {
    const planRes = await fetch("/api/payment/subscription/plan", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: selectedTier }),
    });
    const planData = await planRes.json();
    if (!planRes.ok) throw new Error(planData.error ?? "Could not select that plan");

    const res = await fetch("/api/payment/subscription/update-card", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not start payment");
    tierRef.current = (data.tier as PaidTier) ?? selectedTier;
    return data;
  };

  const handlePaymentComplete = async (result: {
    customerId: string;
    subscriptionId: string;
  }) => {
    try {
      const res = await fetch("/api/payment/subscription/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, tier: tierRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to confirm payment");
      // Full reload rather than a client-side nav: the session payload carries
      // subscriptionstatus, and the guard must re-evaluate against the activated
      // company, not the stale one still in memory.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm payment");
    }
  };

  const openPortal = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payment/portal-session", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error ?? "Could not open the billing portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the billing portal");
      setBusy(false);
    }
  };

  const shell = (title: string, subtitle: string, body: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className={`w-full max-w-2xl p-8 ${CARD}`}>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{subtitle}</p>
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
        <div className="mt-6">{body}</div>
        <div className="mt-8 pt-4 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {user?.companyname}
          </span>
          {signOut}
        </div>
      </div>
    </div>
  );

  // [SCOPE 131 / T012] BEGIN — paused-specific wall copy (FR-007)
  //
  // Driven by the access MODE, not by a status string compared here. The policy
  // module decides what this company's situation is; the wall only decides how to
  // say it. That is the same separation SCOPE-090 established, and it is why
  // adding PAUSED needed one new branch rather than a status check in three files.
  //
  // The generic wall would have offered a plan picker, which is wrong twice over:
  // the company already has a subscription, so picking a plan would open a second
  // one against it, and it implies something is broken when nothing is. A paused
  // company chose this and needs exactly one button to undo it.
  if (access.mode === "resume-subscription") {
    return shell(
      t("subscriptionLifecycle.wallPausedTitle"),
      t("subscriptionLifecycle.wallPausedBody"),
      <div className="text-gray-700 dark:text-gray-300">
        <a
          href="/settings?tab=billing"
          className="inline-flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-white font-medium"
        >
          {t("subscriptionLifecycle.wallPausedCta")}
        </a>
      </div>,
    );
  }
  // [SCOPE 131 / T012] END

  // [SCOPE 131 / T012] A team member of a PAUSED company reaches `contact-admin`,
  // because only an ADMIN can resume — the routing is right, but "subscription
  // incomplete" is not: nothing is incomplete and nothing is broken. `access.status`
  // is the policy's own normalized output, not a status this component fetched and
  // interpreted, so the decision still belongs to the shared module.
  if (access.mode === "contact-admin" && access.status === "PAUSED") {
    return shell(
      t("subscriptionLifecycle.wallPausedTitle"),
      t("subscriptionLifecycle.wallPausedNonAdmin"),
      <div className="text-gray-700 dark:text-gray-300">
        {user?.companyadminemail && (
          <p>
            <a
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              href={`mailto:${user.companyadminemail}`}
            >
              {user.companyadminemail}
            </a>
          </p>
        )}
      </div>,
    );
  }

  if (access.mode === "contact-admin") {
    return shell(
      "Subscription incomplete",
      `Your company's wxKanban subscription is not active, so the workspace is unavailable.`,
      <div className="text-gray-700 dark:text-gray-300">
        <p>
          Only a company administrator can complete the subscription.
          {user?.companyadminemail ? (
            <>
              {" "}
              Please contact{" "}
              <a
                className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                href={`mailto:${user.companyadminemail}`}
              >
                {user.companyadminemail}
              </a>
              .
            </>
          ) : (
            " Please contact your company administrator."
          )}
        </p>
      </div>,
    );
  }

  if (access.mode === "update-card") {
    return shell(
      "Payment failed",
      "We could not charge the card on file, so access is paused until billing is up to date.",
      <button
        onClick={() => void openPortal()}
        disabled={busy}
        className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "Opening…" : "Update payment method"}
      </button>,
    );
  }

  // pick-plan
  if (payingNow) {
    return shell(
      "Complete your subscription",
      "Enter your card details to activate your workspace.",
      <StripePaymentForm
        tier={selectedTier}
        billingEmail={user?.companyemail ?? ""}
        companyName={user?.companyname ?? ""}
        onComplete={handlePaymentComplete}
        onBack={() => setPayingNow(false)}
        initSubscription={initSubscription}
      />,
    );
  }

  return shell(
    "Choose your plan",
    "Your account was created but the subscription was never completed. Pick a plan to activate your workspace.",
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {TIERS.map((t) => (
          <button
            key={t.tier}
            onClick={() => setSelectedTier(t.tier)}
            className={`text-left p-4 rounded-lg border-2 transition ${
              selectedTier === t.tier
                ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20"
                : "border-gray-200 dark:border-slate-700 hover:border-gray-300"
            }`}
          >
            <div className="font-medium text-gray-900 dark:text-white">{t.label}</div>
            <div className="text-lg text-gray-900 dark:text-white">
              {t.price}
              <span className="text-sm text-gray-500 dark:text-gray-400">/mo</span>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t.blurb}</div>
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          setError(null);
          setPayingNow(true);
        }}
        className="mt-6 w-full px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
      >
        Continue to payment
      </button>
    </>,
  );
}
// [SCOPE 090 / T007] END
