import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../components/ThemeProvider";
import { ThemeToggle } from "../components/ThemeToggle";
import { HeroSection } from "../components/LandingPage/HeroSection";
import { FeatureBillboards } from "../components/LandingPage/FeatureBillboards"; // out-of-band preview (marketing-feature-set)
import { FeaturesList } from "../components/LandingPage/FeaturesList";
import { PricingTiers } from "../components/LandingPage/PricingTiers";
import { ComplianceSection } from "../components/LandingPage/ComplianceSection";
import { Menu, X, Download, Puzzle, Rocket } from "lucide-react";
import { useState } from "react";
import { APP_VERSION } from "../version";
import { useTranslation } from "../i18n"; // [SCOPE 051]
import { LanguageToggle } from "../components/LanguageToggle"; // [SCOPE 051]

const version = APP_VERSION;

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  // Localized end-user help file (public/help.html, public/help.<lang>.html).
  const helpHref = locale.startsWith("en") ? "/help.html" : `/help.${locale.split("-")[0]}.html`;
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Redirect authenticated users to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95"
      >
        <div className="max-w-7xl mx-auto px-4 py-2 md:py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">

            <img
              src="/wxKanbanDark.png"
              alt="wxKanban"
              className="h-16 w-auto object-contain dark:hidden"
            />
            <img
              src="/wxKanbanLight.png" 
              alt="wxKanban"
              className="h-16 w-auto object-contain hidden dark:block"
            />
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                theme === "dark"
                  ? "text-slate-100 bg-slate-800 border border-slate-700"
                  : "text-muted-foreground bg-muted"
              }`}
            >
              v{version}
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-7">
            <button
              onClick={() => scrollToSection("hero")}
              className="transition-colors text-slate-700 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-300"
            >
              {t("landing.nav.home")}
            </button>
            <button
              onClick={() => scrollToSection("features-section")}
              className="transition-colors text-slate-700 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-300"
            >
              {t("landing.nav.features")}
            </button>
            <button
              onClick={() => scrollToSection("pricing-section")}
              className="transition-colors text-slate-700 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-300"
            >
              {t("landing.nav.pricing")}
            </button>
            {/* [SCOPE 044 / T007] Internal public Docs page */}
            <button
              onClick={() => navigate("/docs")}
              className="transition-colors text-slate-700 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-300"
            >
              {t("landing.nav.docs")}
            </button>
          </nav>

          {/* Right Side: Language + Theme + Auth Buttons */}
          <div className="flex items-center gap-4">
            <LanguageToggle className="hidden sm:inline-flex" />
            <ThemeToggle />

            {/* Desktop Auth Buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => navigate("/login")}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  theme === "dark"
                    ? "border border-slate-700 bg-slate-900/70 text-slate-100 hover:bg-slate-800"
                    : "border border-border hover:bg-muted"
                }`}
              >
                {t("landing.nav.signIn")}
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-muted"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div
            className={`md:hidden border-t ${
              theme === "dark"
                ? "border-slate-800 bg-[#020817]"
                : "border-border bg-background"
            }`}
          >
            <nav className="max-w-7xl mx-auto px-4 py-4 space-y-3">
              <button
                onClick={() => scrollToSection("hero")}
                className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  theme === "dark" ? "text-slate-200 hover:bg-slate-800/70" : "hover:bg-muted"
                }`}
              >
                {t("landing.nav.home")}
              </button>
              <button
                onClick={() => scrollToSection("features-section")}
                className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  theme === "dark" ? "text-slate-200 hover:bg-slate-800/70" : "hover:bg-muted"
                }`}
              >
                {t("landing.nav.features")}
              </button>
              <button
                onClick={() => scrollToSection("pricing-section")}
                className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  theme === "dark" ? "text-slate-200 hover:bg-slate-800/70" : "hover:bg-muted"
                }`}
              >
                {t("landing.nav.pricing")}
              </button>
              {/* [SCOPE 044 / T007] Internal public Docs page */}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/docs");
                }}
                className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  theme === "dark" ? "text-slate-200 hover:bg-slate-800/70" : "hover:bg-muted"
                }`}
              >
                {t("landing.nav.docs")}
              </button>
              <div className="pt-4 border-t border-border space-y-2">
                <button
                  onClick={() => navigate("/login")}
                  className="w-full px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  {t("landing.nav.signIn")}
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main>
        {/* Feature billboards — out-of-band preview (marketing-feature-set) */}
        <FeatureBillboards />

        {/* Hero Section */}
        <div id="hero">
          <HeroSection
            onLearnMoreClick={() => scrollToSection("features-section")}
          />
        </div>

        {/* Features Section */}
        <FeaturesList />

        {/* Installation & Setup — links to the standalone getting-started guide
            served from public/gettingStartedInstructions.html */}
        <section
          id="install-section"
          className="py-20 px-4 border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40"
        >
          <div className="max-w-5xl mx-auto text-center space-y-6">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {t("landing.install.eyebrow")}
            </span>
            <h2 className="text-3xl md:text-4xl font-bold">{t("landing.install.heading")}</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              {t("landing.install.description")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-2 text-left">
              {[
                { icon: Download, title: t("landing.install.step1.title"), body: t("landing.install.step1.body") },
                { icon: Puzzle, title: t("landing.install.step2.title"), body: t("landing.install.step2.body") },
                { icon: Rocket, title: t("landing.install.step3.title"), body: t("landing.install.step3.body") },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
                >
                  <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-3" />
                  <h3 className="font-semibold mb-1">{title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{body}</p>
                </div>
              ))}
            </div>

            <div className="pt-4">
              {/* [SCOPE 141 / T017] The guide is now Part 1 of the Manual. */}
              <a
                href="/manual/getting-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
              >
                {t("landing.install.cta")}
              </a>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <PricingTiers />

        {/* Compliance Section */}
        <ComplianceSection />

        {/* CTA Section */}
        <section className="py-20 px-4 bg-gradient-to-br from-blue-600 to-cyan-600">
          <div className="max-w-4xl mx-auto text-center text-white space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold">
              {t("landing.cta.headline")}
            </h2>
            <p className="text-lg opacity-90">
              {t("landing.cta.subhead")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => scrollToSection("pricing-section")}
                className="px-8 py-3 rounded-lg bg-white text-blue-600 font-semibold hover:bg-gray-100 transition-colors"
              >
                {t("landing.cta.getStarted")}
              </button>
              <button
                onClick={() => navigate("/registration?tier=CONSULTANT")}
                className="px-8 py-3 rounded-lg border-2 border-white text-white font-semibold hover:bg-white/10 transition-colors"
              >
                {t("landing.cta.viewPricing")}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        className={`border-t ${
          theme === "dark"
            ? "border-slate-800 bg-[#020817]"
            : "border-border bg-background"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div>
              <h3 className="font-bold text-lg mb-4">wxKanban</h3>
              <p className="text-sm text-muted-foreground">
                {t("landing.footer.tagline")}
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold mb-4">{t("landing.footer.product")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#features-section" className="hover:text-foreground">
                    {t("landing.footer.features")}
                  </a>
                </li>
                <li>
                  <a href="#pricing-section" className="hover:text-foreground">
                    {t("landing.footer.pricing")}
                  </a>
                </li>
                <li>
                  <a href={helpHref} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                    {t("landing.footer.documentation")}
                  </a>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4">{t("landing.footer.company")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/about" className="hover:text-foreground">
                    {t("landing.footer.about")}
                  </Link>
                </li>
                {/* Blog hidden for now — re-enable when the channel is live */}
                <li>
                  <a href="mailto:admin@wxperts.com" className="hover:text-foreground">
                    {t("landing.footer.contact")}
                  </a>
                </li>
                {/* [SCOPE 100 / T012] Founder bio — public /bio, self-localizing */}
                <li>
                  <Link to="/bio" className="hover:text-foreground">
                    {t("landing.footer.bio")}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold mb-4">{t("landing.footer.legal")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/privacy" className="hover:text-foreground">
                    {t("landing.footer.privacy")}
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-foreground">
                    {t("landing.footer.terms")}
                  </Link>
                </li>
                <li>
                  <a href="https://wxkanban.io/security" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                    {t("landing.footer.security")}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom */}
          <div className="border-t border-border pt-8 text-sm text-muted-foreground">
            <p>{t("landing.footer.rights")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
