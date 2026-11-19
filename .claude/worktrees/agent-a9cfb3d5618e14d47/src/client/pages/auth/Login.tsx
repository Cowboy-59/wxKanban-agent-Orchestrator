import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "~/client/i18n";

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  // Spec 037 — Honor ?return=<path> for deep-link login (e.g. coming from an
  // engagement-invitation link with an existing account). Only accept
  // same-origin paths starting with '/' to prevent open-redirect.
  const returnTo = (() => {
    const raw = searchParams.get("return");
    if (!raw) return null;
    if (!raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const userData = await login(email, password);
      // If a same-origin return target was provided, honor it.
      if (returnTo) {
        navigate(returnTo);
        return;
      }
      // Otherwise route to the correct dashboard based on user type.
      if (userData.usertype === "SYSADMIN") {
        navigate("/sysadmin/dashboard");
      } else if (userData.usertype === "ADMIN") {
        navigate("/admin/dashboard");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("login.loginFailed");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase = "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:bg-slate-100 dark:disabled:bg-slate-800";
  const inputNormal = `${inputBase} border-slate-300 dark:border-slate-600 focus:ring-indigo-500`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">wxKanban</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">{t("login.tagline")}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("login.emailLabel")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("login.emailPlaceholder")}
              required
              disabled={isLoading}
              className={inputNormal}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t("login.password")}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className={`${inputNormal} pr-10`}
              />
              <button
                type="button"
                onMouseDown={() => setShowPassword(true)}
                onMouseUp={() => setShowPassword(false)}
                onMouseLeave={() => setShowPassword(false)}
                onTouchStart={() => setShowPassword(true)}
                onTouchEnd={() => setShowPassword(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 select-none"
                aria-label={t("login.showPasswordAria")}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-14-14zM10 4.5a6.5 6.5 0 016.481 5.043l1.396 1.396A8 8 0 002.66 10.06l1.396-1.396A6.5 6.5 0 0110 4.5z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            {isLoading ? t("login.signingIn") : t("login.signIn")}
          </button>

          <div className="text-center">
            <Link to="/forgot-password" className="text-sm text-indigo-600 hover:text-indigo-700">
              {t("login.forgotPassword")}
            </Link>
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("login.noAccount")}{" "}
            <Link to="/register" className="text-indigo-600 hover:text-indigo-700 font-semibold">
              {t("login.registerLink")}
            </Link>
          </p>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-500 text-center mb-3">
            {t("login.connectPmPrompt")}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            {["jira", "monday", "asana", "trello"].map((system) => (
              <span
                key={system}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 capitalize"
              >
                {system}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
