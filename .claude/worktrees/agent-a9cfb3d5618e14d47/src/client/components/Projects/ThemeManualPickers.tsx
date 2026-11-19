// Build-your-own manual controls (FR-005/FR-007) — a color picker per semantic
// token (light + dark), plus radius and typography. Edits always produce a
// complete, valid ProjectTheme (no partial state); the parent feeds the result
// straight to the live preview + contrast badges.
import {
  THEME_TOKEN_KEYS,
  hslTripletToHex,
  type ProjectTheme,
  type ThemeTokenSet,
} from "../../../shared/theme-tokens";

// Native <input type="color"> works in #rrggbb; tokens are stored as bare HSL
// triplets, so convert on the way in/out.
// [SCOPE 062 / T010] BEGIN — Build-your-own manual pickers (colors, radius, typography)
function hexToHslTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "0 0% 0%";
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return `${round(h)} ${round(s * 100)}% ${round(l * 100)}%`;
}
// [SCOPE 062 / T010] END

const LABELS: Record<keyof ThemeTokenSet, string> = {
  background: "Background",
  foreground: "Foreground",
  card: "Card",
  cardForeground: "Card fg",
  popover: "Popover",
  popoverForeground: "Popover fg",
  primary: "Primary",
  primaryForeground: "Primary fg",
  secondary: "Secondary",
  secondaryForeground: "Secondary fg",
  muted: "Muted",
  mutedForeground: "Muted fg",
  accent: "Accent",
  accentForeground: "Accent fg",
  destructive: "Destructive",
  destructiveForeground: "Destructive fg",
  border: "Border",
  input: "Input",
  ring: "Ring",
};

// [SCOPE 062 / T010] BEGIN — Build-your-own manual pickers (colors, radius, typography)
function TokenGrid({
  title,
  tokens,
  onToken,
}: {
// [SCOPE 062 / T010] END
  title: string;
  tokens: ThemeTokenSet;
  onToken: (key: keyof ThemeTokenSet, triplet: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEME_TOKEN_KEYS.map((k: keyof ThemeTokenSet) => (
          <label key={String(k)} className="flex items-center gap-2 text-xs">
            <input
              type="color"
              value={hslTripletToHex(tokens[k])}
              onChange={(e) => onToken(k, hexToHslTriplet(e.target.value))}
              className="h-7 w-7 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0"
              aria-label={LABELS[k]}
            />
            <span className="truncate">{LABELS[k]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// [SCOPE 062 / T010] BEGIN — Build-your-own manual pickers (colors, radius, typography)
export default function ThemeManualPickers({
  theme,
  onChange,
}: {
// [SCOPE 062 / T010] END
  theme: ProjectTheme;
  onChange: (theme: ProjectTheme) => void;
}) {
  const setToken = (mode: "light" | "dark", key: keyof ThemeTokenSet, triplet: string) =>
    onChange({ ...theme, [mode]: { ...theme[mode], [key]: triplet }, source: "manual", sourceRef: null });

  return (
    <div className="space-y-4">
      <TokenGrid title="Light tokens" tokens={theme.light} onToken={(k, v) => setToken("light", k, v)} />
      <TokenGrid title="Dark tokens" tokens={theme.dark} onToken={(k, v) => setToken("dark", k, v)} />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Radius</span>
          <input
            type="text"
            value={theme.radius}
            onChange={(e) => onChange({ ...theme, radius: e.target.value, source: "manual" })}
            className="w-full rounded-md border border-input bg-background px-2 py-1"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Type scale</span>
          <input
            type="text"
            value={theme.typography.scale}
            onChange={(e) =>
              onChange({ ...theme, typography: { ...theme.typography, scale: e.target.value }, source: "manual" })
            }
            className="w-full rounded-md border border-input bg-background px-2 py-1"
          />
        </label>
      </div>
      <label className="block space-y-1 text-xs">
        <span className="font-medium text-muted-foreground">Font family</span>
        <input
          type="text"
          value={theme.typography.fontFamily}
          onChange={(e) =>
            onChange({ ...theme, typography: { ...theme.typography, fontFamily: e.target.value }, source: "manual" })
          }
          className="w-full rounded-md border border-input bg-background px-2 py-1"
        />
      </label>
    </div>
  );
}
