// Live theme preview — injects the working ThemeTokenSet as SCOPED CSS variables
// onto a container (never global :root) and renders real components in that theme.
// A light/dark toggle scoped to this node reuses the app's `.dark`-class mechanism
// without touching the surrounding app's theme. Updates immediately on any change.
// SCOPE-106 (T013): renders the business chrome (header/footer) in place + a wider
// control gallery. SCOPE-106 (T020): when `onChromeChange` is supplied the header/footer
// are WYSIWYG-editable directly in the preview (click the name/footer to type, click the
// logo slot to set a logo).
import { useState, type CSSProperties } from "react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import {
  THEME_TOKEN_KEYS,
  TOKEN_CSS_VARS,
  type ProjectTheme,
  type ThemeTokenSet,
} from "../../../shared/theme-tokens";
import { DEFAULT_BUSINESS_CHROME, type BusinessChrome } from "../../../shared/theme-template";

// [SCOPE 062 / T008] BEGIN — `ThemePreview` — scoped CSS vars, real shadcn components, s…
function styleFromTokens(tokens: ThemeTokenSet, radius: string, fontFamily: string): CSSProperties {
  const vars: Record<string, string> = { "--radius": radius, fontFamily };
  for (const k of THEME_TOKEN_KEYS) vars[TOKEN_CSS_VARS[k]] = tokens[k];
  return vars as CSSProperties;
}
// [SCOPE 062 / T008] END

// [SCOPE 062 / T008] BEGIN — `ThemePreview` — scoped CSS vars, real shadcn components, s…
// MODIFIED-BY [SCOPE 106 / T013,T020] — render + WYSIWYG-edit business chrome; wider gallery
export default function ThemePreview({
  theme,
  chrome,
  onChromeChange,
}: {
  theme: ProjectTheme;
  chrome?: BusinessChrome | null;
  /** When supplied, the header/footer become directly editable in the preview (WYSIWYG). */
  onChromeChange?: (patch: Partial<BusinessChrome>) => void;
}) {
// [SCOPE 062 / T008] END
  const [mode, setMode] = useState<"light" | "dark">("light");
  const tokens = mode === "dark" ? theme.dark : theme.light;
  const editable = Boolean(onChromeChange);
  const c = chrome ?? DEFAULT_BUSINESS_CHROME;
  const hasHeader = editable || Boolean(c.appName || c.logoRef);
  const hasFooter = editable || Boolean(c.footerLine);

  function pickLogo(): void {
    const v = window.prompt("Logo image URL (leave blank to remove)", c.logoRef ?? "");
    if (v !== null) onChromeChange?.({ logoRef: v.trim() || null });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Live preview{editable ? " — click the header/footer to edit" : ""}
        </span>
        <div className="inline-flex overflow-hidden rounded-md border border-input text-xs">
          <button
            type="button"
            onClick={() => setMode("light")}
            className={cn("px-3 py-1", mode === "light" ? "bg-primary text-primary-foreground" : "bg-background")}
          >
            Light
          </button>
          <button
            type="button"
            onClick={() => setMode("dark")}
            className={cn("px-3 py-1", mode === "dark" ? "bg-primary text-primary-foreground" : "bg-background")}
          >
            Dark
          </button>
        </div>
      </div>

      {/* Scoped theme surface — CSS vars apply only within this container. */}
      <div
        className={cn(mode === "dark" && "dark")}
        style={styleFromTokens(tokens, theme.radius, theme.typography.fontFamily)}
      >
        <div className="overflow-hidden rounded-lg border border-border bg-background text-foreground">
          {/* SCOPE-106: the customer's own header, in place — editable when onChromeChange is set */}
          {hasHeader ? (
            <header className="flex items-center gap-3 border-b border-border px-6 py-3">
              {editable ? (
                <button
                  type="button"
                  onClick={pickLogo}
                  className="shrink-0"
                  title="Set logo"
                >
                  {c.logoRef ? (
                    <img src={c.logoRef} alt="logo" className="h-7 w-auto" />
                  ) : (
                    <span className="rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                      + logo
                    </span>
                  )}
                </button>
              ) : c.logoRef ? (
                <img src={c.logoRef} alt="logo" className="h-7 w-auto" />
              ) : null}

              {editable ? (
                <input
                  value={c.appName}
                  onChange={(e) => onChromeChange?.({ appName: e.target.value })}
                  placeholder="Your app name"
                  aria-label="Business / app name"
                  className="flex-1 border-b border-transparent bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
                />
              ) : (
                <span className="text-lg font-semibold">{c.appName || "Your App"}</span>
              )}
            </header>
          ) : null}

          <div className="space-y-4 p-6">
            <div className="space-y-1">
              <h3 className="text-2xl font-semibold tracking-tight">The quick brown fox</h3>
              <p className="text-sm text-muted-foreground">
                Jumps over the lazy dog — a sample of body copy in the muted foreground.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="ghost">Ghost</Button>
            </div>

            {/* SCOPE-106: wider control gallery — tabs, select, switch (FR-004) */}
            <div className="flex items-center gap-1 rounded-md border border-border p-1 text-sm">
              <span className="rounded bg-primary px-3 py-1 text-primary-foreground">Overview</span>
              <span className="rounded px-3 py-1 text-muted-foreground">Activity</span>
              <span className="rounded px-3 py-1 text-muted-foreground">Settings</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
                <option>Select an option</option>
                <option>Another option</option>
              </select>
              <span className="inline-flex items-center gap-2 text-sm">
                <span className="inline-flex h-5 w-9 items-center rounded-full bg-primary p-0.5">
                  <span className="h-4 w-4 translate-x-4 rounded-full bg-primary-foreground transition" />
                </span>
                Enabled
              </span>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <p className="mb-2 text-sm font-medium">Card surface</p>
              <input
                type="text"
                placeholder="Input field"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                  Primary badge
                </span>
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  Secondary
                </span>
                <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  Accent
                </span>
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Muted
                </span>
              </div>
            </div>
          </div>

          {/* SCOPE-106: the customer's own footer, in place — editable when onChromeChange is set */}
          {hasFooter ? (
            <footer className="border-t border-border px-6 py-3 text-center text-sm text-muted-foreground">
              {editable ? (
                <input
                  value={c.footerLine}
                  onChange={(e) => onChromeChange?.({ footerLine: e.target.value })}
                  placeholder="Footer line — e.g. © 2026 Your Company"
                  aria-label="Footer line"
                  className="w-full bg-transparent text-center outline-none placeholder:text-muted-foreground"
                />
              ) : (
                c.footerLine
              )}
            </footer>
          ) : null}
        </div>
      </div>
    </div>
  );
}
