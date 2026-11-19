// [SCOPE 070 / T003] BEGIN — Banner Studio brand tokens + size presets
// Brand tokens extracted from the live marketing site (marketing/site/index.html):
// deep navy base, warm amber accent, system font stack. These are the consistent brand
// layer rendered over the AI background; a banner may override any of them via its
// `brandtokens` jsonb. The logo is loaded over the network at render time (env-overridable).
export interface BannerBrandTokens {
  navy: string;
  navyGradient: string;
  ink: string;
  accent: string;
  accentDark: string;
  onAccent: string;
  onDark: string;
  fontFamily: string;
  logoUrl: string;
  // [SCOPE 070 / Amendment-B] v2 overlay tokens
  accentGradient: string; // CSS gradient used for accent headline lines + CTA
  eyebrowColor: string; // colour of the eyebrow label above the headline
}

export const BANNER_BRAND: BannerBrandTokens = {
  navy: "#0f1722",
  navyGradient:
    "radial-gradient(120% 140% at 50% -20%, #1b2840 0%, #0f1722 60%)",
  ink: "#14171c",
  accent: "#c8761b",
  accentDark: "#a45f12",
  onAccent: "#ffffff",
  onDark: "#e7ecf4",
  fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  logoUrl:
    process.env["BANNER_LOGO_URL"] ||
    "https://windev.wxperts.com/wxKanbanLight.png",
  // teal → cyan, matching the reference unchain-banner.svg accent
  accentGradient: "linear-gradient(90deg, #28e0b0 0%, #19b8e6 100%)",
  eyebrowColor: "#7fe9cf",
};

export type BannerLayout = "hero" | "horizontal" | "vertical";

export interface BannerPreset {
  width: number;
  height: number;
  layout: BannerLayout;
  label: string;
}

// The six standard IAB ad units Banner Studio offers. Each maps to a fixed pixel size
// (frozen onto the banner row at create) and an overlay layout archetype.
export const BANNER_PRESETS: Record<string, BannerPreset> = {
  og: { width: 1200, height: 630, layout: "hero", label: "Social / Open Graph" },
  mrec: { width: 300, height: 250, layout: "hero", label: "Medium Rectangle" },
  leaderboard: {
    width: 728,
    height: 90,
    layout: "horizontal",
    label: "Leaderboard",
  },
  skyscraper: {
    width: 160,
    height: 600,
    layout: "vertical",
    label: "Wide Skyscraper",
  },
  halfpage: { width: 300, height: 600, layout: "vertical", label: "Half Page" },
  mobile: {
    width: 320,
    height: 50,
    layout: "horizontal",
    label: "Mobile Leaderboard",
  },
};

export const BANNER_PRESET_KEYS = Object.keys(BANNER_PRESETS);

export function getBannerPreset(key: string): BannerPreset | undefined {
  return BANNER_PRESETS[key];
}
// [SCOPE 070 / T003] END
