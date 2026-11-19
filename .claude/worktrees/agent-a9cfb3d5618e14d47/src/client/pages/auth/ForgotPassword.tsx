import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "~/client/i18n";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("forgotPassword.errorFailed"));
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("forgotPassword.errorFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase = "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:bg-slate-100 dark:disabled:bg-slate-800";
  const inputNormal = `${inputBase} border-slate-300 dark:border-slate-600 focus:ring-indigo-500`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t("forgotPassword.title")}</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          {t("forgotPassword.description")}
        </p>

        {submitted ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
            <p className="text-sm text-green-800 dark:text-green-300">
              {t("forgotPassword.successMessage")}
            </p>
            <div className="mt-4 text-center">
              <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm">
                {t("forgotPassword.backToSignIn")}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("forgotPassword.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("forgotPassword.emailPlaceholder")}
                required
                disabled={isLoading}
                className={inputNormal}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              {isLoading ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
            </button>

            <div className="text-center">
              <Link to="/login" className="text-sm text-indigo-600 hover:text-indigo-700">
                {t("forgotPassword.backToSignIn")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
