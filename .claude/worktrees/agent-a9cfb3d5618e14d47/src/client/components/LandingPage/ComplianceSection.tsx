import { Shield, Award, Lock } from "lucide-react";
import { ReactNode } from "react";
import { useTranslation } from "../../i18n"; // [SCOPE 052] landing i18n

interface Compliance {
  icon: ReactNode;
  name: string;
  description: string;
}

interface ComplianceSectionProps {
  compliance?: Compliance[];
}

export function ComplianceSection({
  compliance,
}: ComplianceSectionProps) {
  const { t } = useTranslation();

  const defaultCompliance: Compliance[] = [
    {
      icon: <Shield className="w-12 h-12" />,
      name: t("landing.compliance.soc2.name"),
      description: t("landing.compliance.soc2.description"),
    },
    {
      icon: <Award className="w-12 h-12" />,
      name: t("landing.compliance.hipaa.name"),
      description: t("landing.compliance.hipaa.description"),
    },
    {
      icon: <Lock className="w-12 h-12" />,
      name: t("landing.compliance.gdpr.name"),
      description: t("landing.compliance.gdpr.description"),
    },
  ];

  const items = compliance ?? defaultCompliance;

  return (
    <section className="py-20 px-4 bg-white dark:bg-slate-950">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            {t("landing.compliance.heading")}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t("landing.compliance.subheading")}
          </p>
        </div>

        {/* Compliance Badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {items.map((item, index) => (
            <div
              key={index}
              className="flex flex-col items-center text-center p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-blue-500/40 transition-all h-full"
            >
              {/* Icon */}
              <div className="mb-4 text-primary">{item.icon}</div>

              {/* Name */}
              <h3 className="text-lg font-bold mb-2">{item.name}</h3>

              {/* Description */}
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>

        {/* Security Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
          <div className="flex gap-4">
            <div className="text-2xl">🔐</div>
            <div>
              <h4 className="font-bold mb-1">{t("landing.compliance.encryption.title")}</h4>
              <p className="text-sm text-muted-foreground">
                {t("landing.compliance.encryption.description")}
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="text-2xl">🔑</div>
            <div>
              <h4 className="font-bold mb-1">{t("landing.compliance.auth.title")}</h4>
              <p className="text-sm text-muted-foreground">
                {t("landing.compliance.auth.description")}
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="text-2xl">📊</div>
            <div>
              <h4 className="font-bold mb-1">{t("landing.compliance.audit.title")}</h4>
              <p className="text-sm text-muted-foreground">
                {t("landing.compliance.audit.description")}
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="text-2xl">👥</div>
            <div>
              <h4 className="font-bold mb-1">{t("landing.compliance.rbac.title")}</h4>
              <p className="text-sm text-muted-foreground">
                {t("landing.compliance.rbac.description")}
              </p>
            </div>
          </div>
        </div>

        {/* Trust Statement */}
        <div className="text-center mt-12 p-6 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-500/20">
          <p className="text-base text-foreground">
            ✓ <span className="font-semibold">{t("landing.compliance.trustLead")}</span>
            {" — "}
            {t("landing.compliance.trustBody")}
          </p>
        </div>
      </div>
    </section>
  );
}
