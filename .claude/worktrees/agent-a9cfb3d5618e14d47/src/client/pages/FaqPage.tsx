// [SCOPE 066 / T006] FAQ page — the menu-bar destination for any authenticated
// user to read published FAQs and ask a question. Reuses FaqPanel inside the shell.
import { AppShell } from "../components/layout/AppShell";
import FaqPanel from "../components/Faq/FaqPanel";
import { useTranslation } from "~/client/i18n";

export default function FaqPage() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("faqPage.title")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("faqPage.subtitle")}
          </p>
        </div>
        <FaqPanel />
      </div>
    </AppShell>
  );
}
