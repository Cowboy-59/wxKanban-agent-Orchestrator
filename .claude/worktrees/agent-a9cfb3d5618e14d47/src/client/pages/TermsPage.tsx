import { StaticPageLayout, H2 } from "../components/StaticPageLayout";
import { useTranslation } from "~/client/i18n";

/**
 * Public Terms of Use for the wxKanban application. Plain-language draft — not legal advice.
 *
 * All visible copy is authored in the i18n bundle under `termsPage` (en-US authoritative);
 * this component only renders from those keys.
 */
export default function TermsPage() {
  const { t } = useTranslation();
  const s = (k: string) => t(`termsPage.sections.${k}`);
  return (
    <StaticPageLayout title={t("termsPage.title")} subtitle={t("termsPage.lastUpdated", { date: "June 29, 2026" })}>
      <p className="text-base text-foreground">
        {t("termsPage.intro")}{" "}
        <a href="/privacy" className="text-blue-600 hover:underline dark:text-blue-300">{t("privacyPage.title")}</a>.
      </p>
      <p className="text-sm text-muted-foreground italic">{t("termsPage.authoritativeNote")}</p>

      <H2>{s("s1heading")}</H2>
      <p>{s("s1body")}</p>

      <H2>{s("s2heading")}</H2>
      <p>{s("s2body")}</p>

      <H2>{s("s3heading")}</H2>
      <p>{s("s3body")}</p>

      <H2>{s("s4heading")}</H2>
      <p>{s("s4body")}</p>

      <H2>{s("s5heading")}</H2>
      <p>{s("s5body")}</p>

      <H2>{s("s6heading")}</H2>
      <p>{s("s6body")}</p>

      <H2>{s("s7heading")}</H2>
      <p>{s("s7body")}</p>

      <H2>{s("s8heading")}</H2>
      <p>{s("s8body")}</p>

      <H2>{s("s9heading")}</H2>
      <p>{s("s9body")}</p>

      <H2>{s("s10heading")}</H2>
      <p>{s("s10body")}</p>

      <H2>{s("s11heading")}</H2>
      <p>{s("s11body")}</p>

      <H2>{s("s12heading")}</H2>
      <p>
        {s("s12body")}{" "}
        <a href="mailto:admin@wxperts.com" className="text-blue-600 hover:underline dark:text-blue-300">admin@wxperts.com</a>.
      </p>
    </StaticPageLayout>
  );
}
