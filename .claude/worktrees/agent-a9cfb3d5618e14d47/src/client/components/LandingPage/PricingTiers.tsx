import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "../../i18n"; // [SCOPE 052] landing i18n

interface TierCard {
  name: string;
  price: number | string;
  priceUnit?: string;
  userLimit: string;
  features: string[];
  isMostPopular?: boolean;
  ctaLabel: string;
  ctaHref: string;
}

interface PricingTiersProps {
  onTierSelect?: (tier: string) => void;
  tiers?: TierCard[];
}

export function PricingTiers({
  onTierSelect,
  tiers,
}: PricingTiersProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Spec 023 FR-001 presents Single User/SMB/Consultant/Enterprise as the paid
  // registration tiers. There is no Free tier — Single User ($19.95/mo) is the
  // entry-level plan. Prices/enum hrefs are locale-invariant; labels come from t().
  const defaultTiers: TierCard[] = [
    {
      name: t("landing.pricing.tiers.single.name"),
      price: "19.95",
      priceUnit: t("landing.pricing.perMonth"),
      userLimit: t("landing.pricing.tiers.single.userLimit"),
      features: [
        t("landing.pricing.tiers.single.f1"),
        t("landing.pricing.tiers.single.f2"),
        t("landing.pricing.tiers.single.f3"),
      ],
      ctaLabel: t("landing.pricing.tiers.single.cta"),
      ctaHref: "/registration?tier=SINGLE_USER",
    },
    {
      name: t("landing.pricing.tiers.smb.name"),
      price: "29.95",
      priceUnit: t("landing.pricing.perMonth"),
      userLimit: t("landing.pricing.tiers.smb.userLimit"),
      features: [
        t("landing.pricing.tiers.smb.f1"),
        t("landing.pricing.tiers.smb.f2"),
        t("landing.pricing.tiers.smb.f3"),
        t("landing.pricing.tiers.smb.f4"),
      ],
      isMostPopular: true,
      ctaLabel: t("landing.pricing.tiers.smb.cta"),
      ctaHref: "/registration?tier=SMALL_BUSINESS",
    },
    {
      name: t("landing.pricing.tiers.consultant.name"),
      price: "39.95",
      priceUnit: t("landing.pricing.perMonth"),
      userLimit: t("landing.pricing.tiers.consultant.userLimit"),
      features: [
        t("landing.pricing.tiers.consultant.f1"),
        t("landing.pricing.tiers.consultant.f2"),
        t("landing.pricing.tiers.consultant.f3"),
        t("landing.pricing.tiers.consultant.f4"),
        t("landing.pricing.tiers.consultant.f5"),
        t("landing.pricing.tiers.consultant.f6"),
      ],
      ctaLabel: t("landing.pricing.tiers.consultant.cta"),
      ctaHref: "/registration?tier=CONSULTANT",
    },
    {
      name: t("landing.pricing.tiers.enterprise.name"),
      price: "59.95",
      priceUnit: t("landing.pricing.tiers.enterprise.priceUnit"),
      userLimit: t("landing.pricing.tiers.enterprise.userLimit"),
      features: [
        t("landing.pricing.tiers.enterprise.f1"),
        t("landing.pricing.tiers.enterprise.f2"),
        t("landing.pricing.tiers.enterprise.f3"),
        t("landing.pricing.tiers.enterprise.f4"),
        t("landing.pricing.tiers.enterprise.f5"),
        t("landing.pricing.tiers.enterprise.f6"),
      ],
      ctaLabel: t("landing.pricing.tiers.enterprise.cta"),
      ctaHref: "/registration?tier=ENTERPRISE",
    },
  ];

  const items = tiers ?? defaultTiers;

  const handleCTA = (tier: TierCard) => {
    if (onTierSelect) {
      onTierSelect(tier.name);
    }
    navigate(tier.ctaHref);
  };

  return (
    <section id="pricing-section" className="py-20 px-4 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            {t("landing.pricing.heading")}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("landing.pricing.subheading")}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {items.map((tier, index) => (
            <div
              key={index}
              className={`relative rounded-lg border bg-slate-50 dark:bg-slate-950/60 transition-all duration-300 flex flex-col h-full ${
                tier.isMostPopular
                  ? "border-blue-500 shadow-lg scale-[1.02] md:scale-[1.04]"
                  : "border-slate-200 dark:border-slate-800 hover:border-blue-500/40"
              }`}
            >
              {/* Most Popular Badge */}
              {tier.isMostPopular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold inline-block">
                    ⭐ {t("landing.pricing.mostPopular")}
                  </span>
                </div>
              )}

              {/* Card Content */}
              <div className={`p-6 flex flex-col flex-grow ${
                tier.isMostPopular ? "bg-blue-50 dark:bg-blue-900/20" : ""
              }`}>
                {/* Tier Name */}
                <h3 className="text-xl font-bold mb-2">{tier.name}</h3>

                {/* User Limit */}
                <p className="text-sm text-muted-foreground mb-4">
                  {tier.userLimit}
                </p>

                {/* Price */}
                <div className="mb-6">
                  {tier.price === "0" ? (
                    <div className="text-4xl font-bold text-primary">
                      {t("landing.pricing.free")}
                    </div>
                  ) : (
                    <div>
                      <div className="text-4xl font-bold text-primary">
                        ${tier.price}
                      </div>
                      {tier.priceUnit && (
                        <p className="text-sm text-muted-foreground">
                          {tier.priceUnit}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Features List */}
                <div className="space-y-3 mb-6 flex-grow">
                  {tier.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleCTA(tier)}
                  className={`w-full py-3.5 text-base font-semibold rounded-lg transition-colors ${
                    tier.isMostPopular
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "border border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  }`}
                >
                  {tier.ctaLabel}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-4">
            {t("landing.pricing.faqText")}{" "}
            <a href="#contact" className="text-primary hover:underline font-semibold">
              {t("landing.pricing.contactSales")}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
