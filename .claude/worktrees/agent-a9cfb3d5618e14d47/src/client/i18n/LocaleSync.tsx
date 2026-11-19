// [SCOPE 051] Apply the signed-in user's saved language preference to the active
// locale. Rendered inside both <AuthProvider> and <I18nProvider>; runs whenever
// the user's preference changes (login, profile update). Logged-out users keep
// the browser/localStorage-detected locale.
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "./index";

export function LocaleSync(): null {
  const { user } = useAuth();
  const { locale, setLocale } = useTranslation();

  useEffect(() => {
    const pref = user?.language;
    if (pref && pref !== locale) setLocale(pref);
  }, [user?.language, locale, setLocale]);

  return null;
}
