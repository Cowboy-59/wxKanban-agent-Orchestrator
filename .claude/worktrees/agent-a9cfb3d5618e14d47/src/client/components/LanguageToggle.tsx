// [SCOPE 051] Visible language switcher. Usable anywhere — including logged-out
// pages (landing/docs) where the Settings selector isn't reachable. Drives the
// i18n locale directly; persists via localStorage in the provider.
//
// For a signed-in user, changing to a language that differs from their saved
// account default reveals an inline prompt ("Set my default language to
// wxKanban") that persists the choice to their profile so it follows them across
// devices — and notes that newsletter emails follow the selected language.
import { useState } from "react";
import { Globe } from "lucide-react";
import { useTranslation, SUPPORTED_LOCALES } from "../i18n";
import { useAuth } from "../context/AuthContext";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useTranslation();
  const { user, setUser } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [saving, setSaving] = useState(false);

  // Only offer to persist when signed in and the live locale differs from the
  // saved account default.
  const differsFromProfile = !!user && user.language !== locale;

  const handleChange = (value: string) => {
    setLocale(value); // live-apply for this session
    setShowPrompt(!!user && value !== user.language);
  };

  const persistAsDefault = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ language: locale }),
      });
      const data = await res.json();
      if (res.ok && data.user && setUser) setUser(data.user);
    } catch {
      // best-effort; the session locale already changed via setLocale
    } finally {
      setSaving(false);
      setShowPrompt(false);
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <Globe className="w-4 h-4 absolute left-2.5 pointer-events-none text-slate-500 dark:text-slate-400" />
      <select
        value={locale}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Language"
        title="Language"
        className="appearance-none pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>

      {showPrompt && differsFromProfile && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-lg">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              disabled={saving}
              onChange={(e) => {
                if (e.target.checked) void persistAsDefault();
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-700 dark:text-slate-200">
              Set my default language to wxKanban
            </span>
          </label>
          <p className="mt-1 pl-6 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            wxKanban will follow this choice on every device. All newsletter emails will
            come in the selected language.
          </p>
        </div>
      )}
    </div>
  );
}
