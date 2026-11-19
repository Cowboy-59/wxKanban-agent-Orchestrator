import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "~/client/i18n";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t("resetPassword.errMissingLink"));
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t("resetPassword.errPasswordMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("resetPassword.errPasswordMismatch"));
      return;
    }
    if (!token) {
      setError(t("resetPassword.errMissingToken"));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || t("resetPassword.errFailed"));
      }

      setSuccess(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("resetPassword.errFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase = "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:bg-slate-100 dark:disabled:bg-slate-800";
  const inputNormal = `${inputBase} border-slate-300 dark:border-slate-600 focus:ring-indigo-500`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t("resetPassword.title")}</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          {t("resetPassword.subtitle")}
        </p>

        {success ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
            <p className="text-sm text-green-800 dark:text-green-300">
              {t("resetPassword.successMessage")}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("resetPassword.newPassword")}
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={isLoading || !token}
                className={inputNormal}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("resetPassword.confirmNewPassword")}
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={isLoading || !token}
                className={inputNormal}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !token}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              {isLoading ? t("resetPassword.updating") : t("resetPassword.updatePassword")}
            </button>

            <div className="text-center">
              <Link to="/login" className="text-sm text-indigo-600 hover:text-indigo-700">
                {t("resetPassword.backToSignIn")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
