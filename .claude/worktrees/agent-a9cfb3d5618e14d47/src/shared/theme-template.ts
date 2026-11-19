// SCOPE-106 / T001 — Business Chrome + Theme Template model, plus the "execute"
// renderers for the customer's own header/footer.
//
// SCOPE-062 owns the executable *look* (ProjectTheme / ThemeTokenSet + theme.css
// renderers). SCOPE-106 adds two things on top: (1) Business Chrome — the customer's
// OWN header/footer (logo, business/app name, footer line), authored by them and
// never derived from any borrowed site; and (2) a Theme Template — a named, reusable
// bundle of a look + chrome, stored per company and picked/inherited by any project.
//
// The chrome renderers here are the chrome analog of SCOPE-062's `renderThemeCss`:
// they emit real header/footer component *source* that is styled entirely through the
// shadcn semantic classes (`bg-background`, `text-foreground`, `border-border`, …),
// so the generated theme.css drives their appearance with no hard-coded colors.

import type { ProjectTheme } from "./theme-tokens";
import { createNode, renderRegionComponent, type BlockNode } from "./block-model";

/** The customer's own header/footer chrome. Authored by the user; laid on top of a
 *  borrowed look and NEVER populated from the extracted site. v1 is intentionally
 *  minimal — logo + name + a single footer line (nav links / multi-column footers are
 *  deferred, see SCOPE-106 Out of Scope). */
export interface BusinessChrome {
  /** Logo reference — an uploaded asset URL or the company logo URL; null when none. */
  logoRef: string | null;
  /** The business/app name shown in the header. */
  appName: string;
  /** A single footer line, e.g. "© 2026 Acme Corp — All rights reserved". */
  footerLine: string;
  // [SCOPE 108 / T001] Header/footer as designable Block-Node trees (retarget). Optional:
  // when absent they are seeded from the flat fields above via `seedChromeTrees` on load,
  // so pre-SCOPE-108 themes open editable with zero migration.
  headerNodes?: BlockNode[];
  footerNodes?: BlockNode[];
}

/** A named, reusable bundle of a look + business chrome, stored per company as a
 *  collection (many per company) and picked/inherited by any project. */
export interface ThemeTemplate {
  id: string;
  name: string;
  theme: ProjectTheme;
  chrome: BusinessChrome;
}

/** A safe, empty default chrome — used when a theme has no chrome yet. */
export const DEFAULT_BUSINESS_CHROME: BusinessChrome = {
  logoRef: null,
  appName: "",
  footerLine: "",
};

// [SCOPE 108 / T001] BEGIN — seed header/footer Block-Node trees from legacy flat chrome
/**
 * Resolve a chrome's header and footer as editable Block-Node trees. When the chrome
 * already carries `headerNodes`/`footerNodes`, they are returned unchanged. Otherwise a
 * default tree is derived from the legacy flat fields — logo + app name → header,
 * footer line → footer — so pre-SCOPE-108 themes open editable with no migration and no
 * backfill. Returns empty regions when a chrome has nothing to seed from. Pure aside from
 * the fresh node ids `createNode` mints; callers persist the result onto the theme.
 */
export function seedChromeTrees(chrome: BusinessChrome): { headerNodes: BlockNode[]; footerNodes: BlockNode[] } {
  return {
    headerNodes: chrome.headerNodes?.length ? chrome.headerNodes : seedHeaderTree(chrome),
    footerNodes: chrome.footerNodes?.length ? chrome.footerNodes : seedFooterTree(chrome),
  };
}

/** A default header tree: a spread row holding the logo (if any) and the app name (if any). */
function seedHeaderTree(chrome: BusinessChrome): BlockNode[] {
  const kids: BlockNode[] = [];
  if (chrome.logoRef) {
    const logo = createNode("image");
    logo.props = { ...logo.props, src: chrome.logoRef, alt: "logo" };
    kids.push(logo);
  }
  if (chrome.appName) {
    const name = createNode("subheading");
    name.props = { ...name.props, text: chrome.appName };
    kids.push(name);
  }
  if (kids.length === 0) return [];
  const row = createNode("row");
  row.props = { ...row.props, align: "spread", valign: "middle" };
  row.children = kids;
  return [row];
}

/** A default footer tree: a centered paragraph carrying the footer line. */
function seedFooterTree(chrome: BusinessChrome): BlockNode[] {
  if (!chrome.footerLine) return [];
  const line = createNode("paragraph");
  line.props = { ...line.props, text: chrome.footerLine, align: "center" };
  return [line];
}
// [SCOPE 108 / T001] END

// ── Chrome renderers (the "execute" core for header/footer artifacts) ─────────

/** Render the customer's Header component source. Styled by shadcn semantic classes
 *  so the project's theme.css drives its colors; user text is embedded as string
 *  literals (injection-safe) rather than raw JSX. */
// [SCOPE 106 / T001] BEGIN — Business Chrome header/footer artifact renderers
// MODIFIED-BY [SCOPE 108 / T009] — prefer the designed header tree; fall back to flat fields
export function renderHeaderComponent(chrome: BusinessChrome, _theme: ProjectTheme): string {
  if (chrome.headerNodes?.length) return renderRegionComponent("Header", "header", chrome.headerNodes);
  const appName = JSON.stringify(chrome.appName ?? "");
  const logoLine = chrome.logoRef
    ? `        <img src={${JSON.stringify(chrome.logoRef)}} alt="logo" className="h-8 w-auto" />\n`
    : "";
  return [
    "// Generated by SCOPE-106 (Borrow-a-Look Business Template).",
    "// Themed via shadcn semantic classes — colors come from the project's theme.css.",
    "export function Header() {",
    `  const appName = ${appName};`,
    "  return (",
    '    <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">',
    '      <div className="flex items-center gap-3">',
    `${logoLine}        <span className="text-lg font-semibold text-foreground">{appName}</span>`,
    "      </div>",
    "    </header>",
    "  );",
    "}",
    "",
  ].join("\n");
}
// [SCOPE 106 / T001] END

/** Render the customer's Footer component source (single footer line, theme-styled). */
// [SCOPE 106 / T001] BEGIN — Business Chrome header/footer artifact renderers
// MODIFIED-BY [SCOPE 108 / T009] — prefer the designed footer tree; fall back to flat fields
export function renderFooterComponent(chrome: BusinessChrome, _theme: ProjectTheme): string {
  if (chrome.footerNodes?.length) return renderRegionComponent("Footer", "footer", chrome.footerNodes);
  const footerLine = JSON.stringify(chrome.footerLine ?? "");
  return [
    "// Generated by SCOPE-106 (Borrow-a-Look Business Template).",
    "export function Footer() {",
    `  const footerLine = ${footerLine};`,
    "  return (",
    '    <footer className="border-t border-border bg-background px-6 py-4 text-center text-sm text-muted-foreground">',
    "      {footerLine}",
    "    </footer>",
    "  );",
    "}",
    "",
  ].join("\n");
}
// [SCOPE 106 / T001] END
