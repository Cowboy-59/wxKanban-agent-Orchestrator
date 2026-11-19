import { StaticPageLayout, H2 } from "../components/StaticPageLayout";
import { useTranslation } from "~/client/i18n";

/**
 * Public About page for the wxKanban product. Reframes the "bridge to software you own"
 * story for the app audience and explains the lifecycle methodology the tool teaches.
 */
export default function AboutPage() {
  const { t } = useTranslation();
  return (
    <StaticPageLayout title={t("aboutPage.title")}>
      <p className="text-base text-foreground">{t("aboutPage.lede")}</p>

      <H2>{t("aboutPage.whatItIsHeading")}</H2>
      <p>{t("aboutPage.whatItIsPara1")}</p>
      <p>{t("aboutPage.whatItIsIntro")}</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong className="text-foreground">{t("aboutPage.teamMgmtLabel")}</strong>{" "}
          {t("aboutPage.teamMgmtBody")}
        </li>
        <li>
          <strong className="text-foreground">{t("aboutPage.checkoutLabel")}</strong>{" "}
          {t("aboutPage.checkoutBody")}
        </li>
        <li>
          <strong className="text-foreground">{t("aboutPage.cockpitLabel")}</strong>{" "}
          {t("aboutPage.cockpitBody")}
        </li>
        <li>
          <strong className="text-foreground">{t("aboutPage.helpLabel")}</strong>{" "}
          {t("aboutPage.helpBody")}
        </li>
      </ul>
      <p>{t("aboutPage.whatItIsClosing")}</p>

      <H2>{t("aboutPage.whyHeading")}</H2>
      <p>
        {t("aboutPage.whyPara1")}
        <em>{t("aboutPage.whyEmphasis")}</em>
        {t("aboutPage.whyPara2")}
      </p>

      <H2>{t("aboutPage.groundHeading")}</H2>
      <p>{t("aboutPage.groundPara")}</p>

      <H2>{t("aboutPage.behindHeading")}</H2>
      <p>
        {t("aboutPage.behindPara1")}
        <strong className="text-foreground">wxperts</strong>
        {t("aboutPage.behindPara2")}
      </p>

      <H2>{t("aboutPage.contactHeading")}</H2>
      <p>
        {t("aboutPage.contactIntro")}{" "}
        <a href="mailto:admin@wxperts.com" className="text-blue-600 hover:underline dark:text-blue-300">
          admin@wxperts.com
        </a>{" "}
        {t("aboutPage.contactOutro")}
      </p>
      <address className="not-italic text-foreground">
        <strong className="text-foreground">wxPerts LLC</strong><br />
        637 Northgate Dr<br />
        Hideaway, TX 75771<br />
        {t("aboutPage.phoneLabel")}{" "}
        <a href="tel:+19036367543" className="text-blue-600 hover:underline dark:text-blue-300">
          +1 903 636 7543
        </a>
      </address>
    </StaticPageLayout>
  );
}
