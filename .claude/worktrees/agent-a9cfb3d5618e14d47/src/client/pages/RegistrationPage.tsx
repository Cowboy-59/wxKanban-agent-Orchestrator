import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import CompanyInfoForm from "../components/CompanyInfoForm";
import StripePaymentForm from "../components/StripePaymentForm";
import AdminAccountForm from "../components/AdminAccountForm";
import { useTranslation } from "../i18n"; // [SCOPE 052]

/**
 * Multi-step registration form for company setup
 *
 * Flow (tier is pre-selected from landing page URL param):
 * Step 1: Company Information (name, billing email, address, phone, country)
 * Step 2: Payment Method — paid tiers (CONSULTANT, ENTERPRISE) only
 * Step 3: Admin Account Setup (email, password, name)
 */

export type RegistrationStep = "company" | "payment" | "admin" | "success";

type Tier = "FREE" | "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";
type PaidTier = "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

// Spec 023 FR-001: all three SMB/Consultant/Enterprise plans gate activation on payment.
const PAID_TIERS: Tier[] = ["SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"];

export interface RegistrationFormData {
  companyName: string;
  billingEmail: string;
  billingAddress: string;
  billingCountry: string;
  billingPhone: string;
  subscriptionTier: Tier;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  appliedPromoDays?: number;
  referredBy?: string; // [SCOPE 088 / T005] optional distributor referral code
  newsletterOptIn?: boolean; // [SCOPE 064 / T010] Amendment A — newsletter opt-in at signup
}

export interface RegistrationResponse {
  success: boolean;
  message: string;
  company: {
    companyId: string;
    companyName: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    maxUsers: number;
  };
  admin: {
    userId: string;
    email: string;
    status: string;
  };
  nextStep: string;
}

// FREE is intentionally omitted: it's an internal/legacy tier, not a public
// signup option. A ?tier=FREE link falls back to the default (SINGLE_USER).
const isValidTier = (tier: string): tier is Tier =>
  ["SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"].includes(tier);

// [SCOPE 023 / T108] Resolved server-side from the ?invite= token. Everything
// here is authoritative — the client cannot alter the plan or the promo length.
interface InviteInfo {
  email: string;
  billingplan: Tier;
  promoDays: number;
  monthlyPrice: number;
  expiresAt: string;
}

const RegistrationPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const tierParam = searchParams.get("tier") ?? "";
  const preSelectedTier: Tier = isValidTier(tierParam) ? tierParam : "SINGLE_USER";
  // [SCOPE 023 / T109] BEGIN — invite-bound promo (FR-002a / FR-002b).
  // The old `?promo=N` is deliberately gone: it was a client-supplied promo
  // length on a public endpoint, so anyone could self-grant a free year. A promo
  // now requires an invitation token, and its length + plan are resolved
  // server-side. The token here is only an opaque key.
  const inviteToken = searchParams.get("invite") ?? undefined;
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken));
  // [SCOPE 023 / T109] END
  // [SCOPE 088 / T007] BEGIN — referral code auto-fill via ?ref= (FR-011, Amendment A)
  // A distributor shares one link (e.g. /register?ref=C6HFRK53) instead of a code to
  // retype. Pre-fills the existing FR-007 "Referred by" field only — still a normal,
  // editable text input, and an unrecognized code still fails gracefully per FR-008.
  const refParam = (searchParams.get("ref") ?? "").trim().toUpperCase().slice(0, 8);
  // [SCOPE 088 / T007] END
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState<RegistrationStep>("company");
  const [formData, setFormData] = useState<RegistrationFormData>({
    companyName: "",
    billingEmail: "",
    billingAddress: "",
    billingCountry: "US",
    billingPhone: "",
    subscriptionTier: preSelectedTier,
    adminEmail: "",
    adminPassword: "",
    adminFirstName: "",
    adminLastName: "",
    referredBy: refParam, // [SCOPE 088 / T007] MODIFIED-BY — seeded from ?ref= (FR-011)
    newsletterOptIn: true, // [SCOPE 064 / T010] opted-in by default
  });
  const [registrationResult, setRegistrationResult] = useState<RegistrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPaidTier = PAID_TIERS.includes(formData.subscriptionTier);
  const requiresPaymentStep = isPaidTier && paymentsEnabled;

  useEffect(() => {
    let cancelled = false;

    const loadPaymentConfig = async () => {
      try {
        const response = await fetch("/api/payment/config");
        if (!response.ok) {
          throw new Error("Failed to load payment settings");
        }

        // [SCOPE 023 / T109] globalPromoDays is no longer read here. It was only
        // ever fetched and stored, never rendered, and the promo a registrant
        // actually gets is decided server-side (FR-002b).
        const data = (await response.json()) as {
          paymentsEnabled?: boolean;
        };

        if (!cancelled) {
          setPaymentsEnabled(data.paymentsEnabled !== false);
          setConfigError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPaymentsEnabled(true);
          setConfigError(err instanceof Error ? err.message : "Failed to load payment settings");
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
        }
      }
    };

    loadPaymentConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  // [SCOPE 023 / T108] BEGIN — resolve the invitation before anything is entered.
  // Resolving does NOT consume it; redemption happens once, at /auth/register.
  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/payment/registration/invite/${encodeURIComponent(inviteToken)}`,
        );
        const body = (await response.json()) as InviteInfo & { error?: string };

        if (cancelled) return;

        if (!response.ok) {
          setInviteError(body.error ?? t("register.inviteInvalid"));
          return;
        }

        setInvite(body);
        setInviteError(null);
        // The invitation pins the address and the plan. The server enforces both
        // regardless; locking them here just avoids a pointless rejection later.
        setFormData((prev) => ({
          ...prev,
          adminEmail: body.email,
          billingEmail: prev.billingEmail || body.email,
          subscriptionTier: body.billingplan,
        }));
      } catch {
        if (!cancelled) setInviteError(t("register.inviteInvalid"));
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteToken, t]);
  // [SCOPE 023 / T108] END

  useEffect(() => {
    // [SCOPE 090 / T003] Payment is the last step; if it isn't required (free or
    // payments disabled) the account was already activated at register — jump to
    // success rather than back into a step that no longer applies.
    if (currentStep === "payment" && !requiresPaymentStep) {
      setCurrentStep("success");
    }
  }, [currentStep, requiresPaymentStep]);

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: data.companyName,
          billingEmail: data.billingEmail,
          billingAddress: data.billingAddress,
          billingCountry: data.billingCountry,
          billingPhone: data.billingPhone,
          subscriptionTier: data.subscriptionTier,
          adminEmail: data.adminEmail,
          adminPassword: data.adminPassword,
          adminFirstName: data.adminFirstName,
          adminLastName: data.adminLastName,
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
          appliedPromoDays: data.appliedPromoDays,
          referredBy: data.referredBy, // [SCOPE 088 / T005]
          newsletterOptIn: data.newsletterOptIn, // [SCOPE 064 / T010] Amendment A
          // [SCOPE 023 / T109] The server re-resolves this token, re-checks the
          // email binding, and burns it. Sending it is not what grants the promo.
          ...(inviteToken ? { inviteToken } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Registration failed");
      }

      return response.json() as Promise<RegistrationResponse>;
    },
    onSuccess: (data) => {
      // [SCOPE 090 / T003] BEGIN — account is now persisted BEFORE payment. For a
      // paid tier the record already exists (PENDING) and the admin is logged in,
      // so we advance to the card step; the payment can never again succeed
      // without a saved company+user. Free / payments-disabled go straight to
      // success (registration already activated them).
      setRegistrationResult(data);
      setError(null);
      setCurrentStep(requiresPaymentStep ? "payment" : "success");
      // [SCOPE 090 / T003] END
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleCompanyInfoNext = (data: {
    companyName: string;
    billingEmail: string;
    billingAddress: string;
    billingCountry: string;
    billingPhone: string;
    referredBy: string;
  }) => {
    setFormData((prev) => ({ ...prev, ...data }));
    if (configLoading) {
      setError("Registration settings are still loading. Please try again in a moment.");
      return;
    }

    // [SCOPE 090 / T003] Admin account is collected before payment now.
    setCurrentStep("admin");
    setError(null);
  };

  const handleAdminAccountSubmit = (data: {
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName?: string;
    newsletterOptIn: boolean; // [SCOPE 064 / T010] Amendment A
  }) => {
    // [SCOPE 090 / T003] Submitting the admin form registers the company+user
    // (PENDING for paid tiers) and logs the admin in — the record is saved here,
    // before Stripe. registerMutation.onSuccess then routes to the payment step.
    const finalData = { ...formData, ...data };
    setFormData(finalData);
    registerMutation.mutate(finalData);
  };

  // [SCOPE 090 / T003] BEGIN — payment step now runs AFTER the account exists and
  // the admin is authenticated (register set an httpOnly session cookie). It uses
  // the same authenticated endpoints as the Billing tab: /subscription/update-card
  // creates the Stripe subscription against the saved company (applying any promo
  // the redeemed invite entitles it to, server-side), and /subscription/confirm
  // activates it. A dropped card step leaves a harmless PENDING account the admin
  // can finish paying for from Settings → Billing.
  const registeredTierRef = React.useRef<PaidTier | null>(null);

  const initRegistrationSubscription = async () => {
    const res = await fetch("/api/payment/subscription/update-card", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? t("register.initPaymentError"));
    }
    registeredTierRef.current = data.tier;
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
        body: JSON.stringify({
          customerId: result.customerId,
          subscriptionId: result.subscriptionId,
          tier: registeredTierRef.current ?? formData.subscriptionTier,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to confirm payment");
      }
      setError(null);
      setCurrentStep("success");
    } catch (err) {
      // The account is already saved; surface the error but keep them on the card
      // step so they can retry. They can also finish later from Settings → Billing.
      setError(err instanceof Error ? err.message : "Failed to confirm payment");
    }
  };

  // [SCOPE 090 / T003] END

  const handleBack = () => {
    // [SCOPE 090 / T012] Amendment A FR-013. This used to be "finish payment
    // later", which quietly created a usable-looking PENDING account. Under the
    // subscription gate that path leads only to a wall on the next navigation, so
    // offering it as a choice misrepresented what the user was getting. Back on
    // the payment step now returns to the account details instead.
    if (currentStep === "payment") {
      setCurrentStep("admin");
      setError(null);
      return;
    }
    if (currentStep === "admin") setCurrentStep("company");
    setError(null);
  };

  // Progress bar config — paid tiers have 3 steps, free tiers have 2.
  // [SCOPE 090 / T003] Payment is now the LAST step: the company + admin account
  // are saved (PENDING) before any card is collected, so a successful charge
  // always has a persisted account behind it.
  const steps: RegistrationStep[] = requiresPaymentStep
    ? ["company", "admin", "payment"]
    : ["company", "admin"];
  const stepLabels = requiresPaymentStep
    ? [t("register.stepCompany"), t("register.stepAdmin"), t("register.stepPayment")]
    : [t("register.stepCompany"), t("register.stepAdmin")];
  const currentStepIndex = steps.indexOf(currentStep);
  const progressPct = currentStepIndex >= 0
    ? Math.round(((currentStepIndex + 1) / steps.length) * 100)
    : 100;

  const tierLabel: Record<Tier, string> = {
    FREE: "Free",
    SINGLE_USER: "Single User",
    SMALL_BUSINESS: "Small/Medium Business",
    CONSULTANT: "Consultant",
    ENTERPRISE: "Enterprise",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {t("register.title")}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            {t("register.settingUp")}{" "}
            <span className="font-semibold text-blue-600">{tierLabel[preSelectedTier]}</span>{" "}
            {t("register.account")}
          </p>
        </div>

        {/* Progress indicator */}
        {currentStep !== "success" && (
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              {stepLabels.map((label, index) => (
                <div
                  key={label}
                  className={`text-sm font-medium ${
                    index <= currentStepIndex ? "text-blue-600" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* [SCOPE 023 / T108] BEGIN — invitation state (FR-002a) */}
        {inviteLoading && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-700 rounded-lg">
            <p className="text-slate-700 dark:text-slate-300 text-sm">
              {t("register.inviteChecking")}
            </p>
          </div>
        )}

        {inviteError && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-300 text-sm">{inviteError}</p>
          </div>
        )}

        {invite && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-blue-900 dark:text-blue-200 text-sm font-semibold">
              {t("register.inviteFreeMonths", {
                days: invite.promoDays,
                plan: tierLabel[invite.billingplan],
              })}
            </p>
            <p className="text-blue-900 dark:text-blue-200 text-sm mt-1">
              {t("register.inviteBoundTo", { email: invite.email })}
            </p>
          </div>
        )}
        {/* [SCOPE 023 / T108] END */}

        {!paymentsEnabled && isPaidTier && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-amber-900 dark:text-amber-200 text-sm">
              Credit-card processing is temporarily disabled for testing. Your {tierLabel[formData.subscriptionTier]} signup will skip Stripe and continue directly to admin setup.
            </p>
          </div>
        )}

        {configError && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-700 rounded-lg">
            <p className="text-slate-700 dark:text-slate-300 text-sm">
              Payment settings could not be verified. Paid tiers will continue with the standard Stripe step.
            </p>
          </div>
        )}

        {/* Form sections */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8">
          {currentStep === "company" && (
            <CompanyInfoForm
              onNext={handleCompanyInfoNext}
              initialData={formData}
            />
          )}

          {currentStep === "payment" && (
            // [SCOPE 090 / T003] Authenticated subscribe: the account already
            // exists, so drive StripePaymentForm against /subscription/update-card
            // (via initSubscription) instead of the public registration endpoint.
            // onBack = "finish payment later" (account is already saved).
            <StripePaymentForm
              tier={formData.subscriptionTier as PaidTier}
              billingEmail={formData.billingEmail}
              companyName={formData.companyName}
              initSubscription={initRegistrationSubscription}
              onComplete={handlePaymentComplete}
              onBack={handleBack}
            />
          )}

          {currentStep === "admin" && (
            <AdminAccountForm
              onSubmit={handleAdminAccountSubmit}
              onBack={handleBack}
              isLoading={registerMutation.isPending}
              initialData={formData}
            />
          )}

          {currentStep === "success" && registrationResult && (
            <div className="text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <svg
                    className="w-8 h-8 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                {t("register.successTitle")}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                {t("register.verificationSent")}{" "}
                <strong>{registrationResult.admin.email}</strong>
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6 text-left">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">{t("register.whatsNext")}</h3>
                <ol className="space-y-2 text-slate-700 dark:text-slate-300">
                  <li className="flex items-start">
                    <span className="font-semibold mr-2">1.</span>
                    <span>{t("register.next1")}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-semibold mr-2">2.</span>
                    <span>{t("register.next2")}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-semibold mr-2">3.</span>
                    <span>{t("register.next3")}</span>
                  </li>
                </ol>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => navigate("/login")}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
                >
                  {t("register.goToLogin")}
                </button>
                <button
                  onClick={() => { navigate("/registration"); window.location.reload(); }}
                  className="w-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 font-semibold py-2 px-4 rounded-lg transition duration-200"
                >
                  {t("register.createAnother")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-slate-600 dark:text-slate-400">
          <p>
            {t("register.haveAccount")}{" "}
            <a href="/login" className="text-blue-600 hover:text-blue-700 font-semibold">
              {t("register.signIn")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegistrationPage;
