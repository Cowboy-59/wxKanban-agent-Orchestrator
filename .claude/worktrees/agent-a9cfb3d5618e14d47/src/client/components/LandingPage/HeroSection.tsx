import { useTheme } from "../ThemeProvider";
import { useTranslation } from "../../i18n"; // [SCOPE 051]

interface HeroSectionProps {
  onLearnMoreClick?: () => void;
}

export function HeroSection({ onLearnMoreClick }: HeroSectionProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handleLearnMoreClick = () => {
    if (onLearnMoreClick) {
      onLearnMoreClick();
    }
    // Scroll to features section
    const element = document.getElementById("features-section");
    element?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative w-full flex flex-col items-center overflow-hidden pt-6 pb-16">
      {/* Background with gradient */}
      <div
        className={`absolute inset-0 ${
          theme === "dark"
            ? "bg-gradient-to-br from-[#051231] via-[#0b2a74] to-[#051231]"
            : "bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50"
        }`}
      />

      {/* Hero Image */}
      <div className="absolute inset-0 opacity-20">
        <svg
          viewBox="0 0 1200 600"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.1"
              />
            </pattern>
          </defs>
          <rect width="1200" height="600" fill="url(#grid)" />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        {/* Subtitle */}
        <h2
          className={`text-xl md:text-2xl lg:text-3xl font-semibold mb-6 ${
            theme === "dark" ? "text-blue-200" : "text-blue-700"
          }`}
        >
          {t("landing.hero.subtitle")}
        </h2>

        {/* Description */}
        <p className="text-base md:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
          {t("landing.hero.description")}
        </p>

        {/* Badges */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
              theme === "dark"
                ? "border-blue-500/30 bg-blue-500/10"
                : "border-blue-200 bg-blue-50"
            }`}
          >
            <span className="text-sm font-medium">✓ SOC 2</span>
          </div>
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
              theme === "dark"
                ? "border-green-500/30 bg-green-500/10"
                : "border-green-200 bg-green-50"
            }`}
          >
            <span className="text-sm font-medium">✓ HIPAA</span>
          </div>
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
              theme === "dark"
                ? "border-purple-500/30 bg-purple-500/10"
                : "border-purple-200 bg-purple-50"
            }`}
          >
            <span className="text-sm font-medium">✓ GDPR</span>
          </div>
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
              theme === "dark"
                ? "border-orange-500/30 bg-orange-500/10"
                : "border-orange-200 bg-orange-50"
            }`}
          >
            <span className="text-sm font-medium">✓ HITRUST</span>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <button
            onClick={() => {
              const element = document.getElementById("pricing-section");
              element?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-8 py-6 text-lg font-semibold rounded-lg min-w-fit bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            {t("landing.hero.getStarted")}
          </button>
          <button
            onClick={handleLearnMoreClick}
            className={`px-8 py-6 text-lg font-semibold rounded-lg min-w-fit transition-colors ${
              theme === "dark"
                ? "border border-blue-500/70 text-blue-300 hover:bg-blue-900/30"
                : "border border-blue-600 text-blue-600 hover:bg-blue-50"
            }`}
          >
            {t("landing.hero.learnMore")}
          </button>
        </div>
      </div>
    </section>
  );
}
