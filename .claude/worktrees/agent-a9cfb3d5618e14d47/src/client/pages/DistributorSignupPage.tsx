/**
 * DistributorSignupPage
 * SCOPE-088 — Distributor Affiliate Onboarding & Referral Attribution, T004
 *
 * Route: /distributor-signup  (public, unlisted, no nav)
 *
 * A distributor who receives the shared link self-onboards into a FREE
 * single-user account. On success we reveal the generated referral code so the
 * distributor can share it; customers who enter that code at signup are
 * attributed back to this distributor. Attribution-only — no commissions here.
 *
 * Modeled on ConsultantProvisionForm (SCOPE-037 / T057).
 */

import { useState } from "react";
import {
  Handshake,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import { useTranslation } from "~/client/i18n";

interface DistributorResult {
  referralCode?: string;
  email: string;
}

// [SCOPE 088 / T004] BEGIN — DistributorSignupPage
export default function DistributorSignupPage() {
  const { t } = useTranslation();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DistributorResult | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t("distributorSignup.errorPasswordsMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("distributorSignup.errorPasswordTooShort"));
      return;
    }
    if (!acceptTerms) {
      setError(t("distributorSignup.errorAcceptTerms"));
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/register-distributor", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          adminFirstName: fullName,
          adminEmail: email,
          adminPassword: password,
        }),
      });
      const body = await r.json();
      if (!r.ok)
        throw new Error(body.error || t("distributorSignup.errorRegistrationFailed"));
      setResult({ referralCode: body.referralCode, email: body.email });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("distributorSignup.errorUnknown"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!result?.referralCode) return;
    try {
      await navigator.clipboard.writeText(result.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be unavailable (insecure context) — the code is still visible.
    }
  };

  // ── Success: reveal the referral code ──────────────────────────────────────
  if (result) {
    return (
      <ShellWrapper>
        <div className="text-center space-y-2">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t("distributorSignup.successHeading")}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("distributorSignup.successSignedInPrefix")}{" "}
            <strong>{result.email}</strong>.
          </p>
        </div>

        {result.referralCode ? (
          <div className="rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-4 space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("distributorSignup.referralCodeLabel")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-center text-2xl font-bold tracking-widest text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-3">
                {result.referralCode}
              </code>
              <button
                onClick={copyCode}
                title={t("distributorSignup.copyCodeTitle")}
                className="p-3 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("distributorSignup.referralCodeHelp")}
            </p>
          </div>
        ) : null}

        <a
          href="/dashboard"
          className="w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          {t("distributorSignup.goToDashboard")}
        </a>
      </ShellWrapper>
    );
  }

  // ── Signup form ────────────────────────────────────────────────────────────
  return (
    <ShellWrapper>
      <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4 flex items-start gap-3">
        <Handshake className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-slate-700 dark:text-slate-300">
          {t("distributorSignup.introBannerBefore")}{" "}
          <strong>{t("distributorSignup.introBannerFree")}</strong>{" "}
          {t("distributorSignup.introBannerAfter")}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Field
          label={t("distributorSignup.fieldBusinessName")}
          value={companyName}
          onChange={setCompanyName}
          placeholder="Acme Distribution LLC"
        />
        <Field
          label={t("distributorSignup.fieldFullName")}
          value={fullName}
          onChange={setFullName}
          placeholder="Jane Doe"
        />
        <Field
          label={t("distributorSignup.fieldEmail")}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@business.com"
        />
        <Field
          label={t("distributorSignup.fieldPassword")}
          type="password"
          value={password}
          onChange={setPassword}
          minLength={8}
          placeholder={t("distributorSignup.placeholderPassword")}
        />
        <Field
          label={t("distributorSignup.fieldConfirmPassword")}
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder={t("distributorSignup.placeholderConfirmPassword")}
        />

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-1"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {t("distributorSignup.acceptTermsLabel")}
          </span>
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            t("distributorSignup.creatingAccount")
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />{" "}
              {t("distributorSignup.createAccountButton")}
            </>
          )}
        </button>
      </form>
    </ShellWrapper>
  );
}
// [SCOPE 088 / T004] END

// ───────────────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  minLength?: number;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
        {label}
      </label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={minLength}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
    </div>
  );
}

function ShellWrapper({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            wxKanban
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t("distributorSignup.pageSubtitle")}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg p-8 space-y-5">
          {children}
        </div>
      </div>
    </div>
  );
}
