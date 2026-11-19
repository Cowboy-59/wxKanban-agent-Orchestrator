import { StaticPageLayout, H2 } from "../components/StaticPageLayout";
import { useTranslation } from "~/client/i18n";

/**
 * Public Privacy Policy for the wxKanban application. Reflects the app's actual data
 * practices: account data, the work you create, Stripe-processed billing, PM-integration
 * tokens, and AI processing. Plain-language draft — not legal advice.
 *
 * All visible copy is authored in the i18n bundle under `privacyPage` (en-US authoritative);
 * this component only renders from those keys.
 */
function Bullet({ text }: { text: string }) {
  const i = text.indexOf(" — ");
  return i > 0 ? (
    <li>
      <strong className="text-foreground">{text.slice(0, i)}</strong>
      {text.slice(i)}
    </li>
  ) : (
    <li>{text}</li>
  );
}

export default function PrivacyPage() {
  const { t } = useTranslation();
  const s = (k: string) => t(`privacyPage.sections.${k}`);
  return (
    <StaticPageLayout title={t("privacyPage.title")} subtitle={t("privacyPage.lastUpdated", { date: "June 29, 2026" })}>
      <p className="text-base text-foreground">{t("privacyPage.intro")}</p>
      <p className="text-sm text-muted-foreground italic">{t("privacyPage.authoritativeNote")}</p>

      <H2>{s("s1heading")}</H2>
      <ul className="list-disc pl-6 space-y-2">
        <Bullet text={s("s1item1")} />
        <Bullet text={s("s1item2")} />
        <Bullet text={s("s1item3")} />
        <Bullet text={s("s1item4")} />
        <Bullet text={s("s1item5")} />
      </ul>

      <H2>{s("s2heading")}</H2>
      <ul className="list-disc pl-6 space-y-2">
        <Bullet text={s("s2item1")} />
        <Bullet text={s("s2item2")} />
        <Bullet text={s("s2item3")} />
        <Bullet text={s("s2item4")} />
        <Bullet text={s("s2item5")} />
      </ul>

      <H2>{s("s3heading")}</H2>
      <p>{s("s3body")}</p>

      <H2>{s("s4heading")}</H2>
      <p>{s("s4body")}</p>

      <H2>{s("s5heading")}</H2>
      <p>{s("s5body")}</p>

      <H2>{s("s6heading")}</H2>
      <p>{s("s6body")}</p>

      <H2>{s("s7heading")}</H2>
      <p>
        {s("s7body")}{" "}
        <a href="mailto:admin@wxperts.com" className="text-blue-600 hover:underline dark:text-blue-300">admin@wxperts.com</a>.
      </p>

      <H2>{s("s8heading")}</H2>
      <p>{s("s8body")}</p>

      <H2>{s("s9heading")}</H2>
      <p>
        {s("s9body")}{" "}
        <a href="mailto:admin@wxperts.com" className="text-blue-600 hover:underline dark:text-blue-300">admin@wxperts.com</a>.
      </p>
    </StaticPageLayout>
  );
}
