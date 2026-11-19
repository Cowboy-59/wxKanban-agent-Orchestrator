import {
  Zap,
  Shield,
  GitBranch,
  RefreshCw,
  Users,
  CheckCircle2,
} from "lucide-react";
import { ReactNode } from "react";
import { useTranslation } from "../../i18n"; // [SCOPE 052] landing i18n

interface Feature {
  icon: ReactNode;
  title: string;
  description: string | ReactNode;
}

interface FeaturesListProps {
  features?: Feature[];
}

export function FeaturesList({ features }: FeaturesListProps) {
  const { t } = useTranslation();

  const defaultFeatures: Feature[] = [
    {
      icon: <Zap className="w-8 h-8" />,
      title: t("landing.features.aiPowered.title"),
      description: t("landing.features.aiPowered.description"),
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: t("landing.features.security.title"),
      description: t("landing.features.security.description"),
    },
    {
      icon: <GitBranch className="w-8 h-8" />,
      title: t("landing.features.integration.title"),
      description: t("landing.features.integration.description"),
    },
    {
      icon: <RefreshCw className="w-8 h-8" />,
      title: t("landing.features.conversion.title"),
      description: (
        <div className="text-sm text-muted-foreground leading-relaxed flex-grow">
          <p className="mb-3">{t("landing.features.conversion.intro")}</p>
          <ul className="space-y-2 text-left list-none">
            <li>• WinDev / WebDev / WinDev Mobile</li>
            <li>• Clarion for Windows</li>
            <li>• Visual Basic</li>
            <li>• {t("landing.features.conversion.more")}</li>
          </ul>
        </div>
      ),
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: t("landing.features.collaboration.title"),
      description: (
        <ul className="text-sm text-muted-foreground space-y-3 text-left list-none">
          <li>• {t("landing.features.collaboration.item1")}</li>
          <li>• {t("landing.features.collaboration.item2")}</li>
          <li>• {t("landing.features.collaboration.item3")}</li>
          <li>• {t("landing.features.collaboration.item4")}</li>
        </ul>
      ),
    },
    {
      icon: <CheckCircle2 className="w-8 h-8" />,
      title: t("landing.features.lifecycle.title"),
      description: (
        <ul className="text-sm text-muted-foreground space-y-3 text-left list-none">
          <li>• {t("landing.features.lifecycle.item1")}</li>
          <li>• {t("landing.features.lifecycle.item2")}</li>
          <li>• {t("landing.features.lifecycle.item3")}</li>
          <li>• {t("landing.features.lifecycle.item4")}</li>
          <li>• {t("landing.features.lifecycle.item5")}</li>
          <li className="pt-1 font-medium text-foreground">
            {t("landing.features.lifecycle.footer")}
          </li>
        </ul>
      ),
    },
  ];

  const items = features ?? defaultFeatures;

  return (
    <section id="features-section" className="py-20 px-4 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            {t("landing.features.heading")}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("landing.features.subheading")}
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-7">
          {items.map((feature, index) => (
            <div
              key={index}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg h-full flex flex-col"
            >
              {/* Icon */}
              <div className="mb-4 text-primary">{feature.icon}</div>

              {/* Title */}
              <h3 className="text-lg font-semibold mb-3">{feature.title}</h3>

              {/* Description */}
              {typeof feature.description === "string" ? (
                <p className="text-sm text-muted-foreground leading-relaxed flex-grow">
                  {feature.description}
                </p>
              ) : (
                <div className="leading-relaxed flex-grow">{feature.description}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
