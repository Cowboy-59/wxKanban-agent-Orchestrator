// [SCOPE 047 / 055] Per-application-type default stacks + default design tokens,
// and the canonical stack.md renderer.
//
// FR-002 — application type (web/desktop/mobile) seeds the recommended default
// stack. FR-003 — six stack dimensions, each with a one-line rationale.
// Default-first: accepting these defaults yields a complete, valid stack.md.
//
// Resolution order (FR-002): project's own stack.md → company-wide profile
// (spec 057) → these kit built-in defaults. Until 057 lands, resolution falls
// straight through to these.

export type AppType = "web" | "desktop" | "mobile";

export const APP_TYPES: readonly AppType[] = ["web", "desktop", "mobile"] as const;

export const APP_TYPE_LABELS: Record<AppType, string> = {
  web: "Web",
  desktop: "Desktop",
  mobile: "Mobile",
};

/** The six stack dimensions captured for every project (FR-003). */
export type StackDimension =
  | "backend"
  | "frontend"
  | "database"
  | "styling"
  | "testing"
  | "hosting";

export const STACK_DIMENSIONS: readonly StackDimension[] = [
  "backend",
  "frontend",
  "database",
  "styling",
  "testing",
  "hosting",
] as const;

export const STACK_DIMENSION_LABELS: Record<StackDimension, string> = {
  backend: "Backend",
  frontend: "Frontend",
  database: "Database",
  styling: "Styling / Components",
  testing: "Testing",
  hosting: "Hosting / Deploy",
};

/** A single captured stack choice — the value plus a one-line rationale. */
export interface StackChoice {
  value: string;
  rationale: string;
}

export type StackChoices = Record<StackDimension, StackChoice>;

/** Concrete design tokens derived from a look-and-feel reference (FR-004). */
export interface DesignTokens {
  /** Color palette — semantic roles → hex/value. */
  colors: {
    primary: string;
    secondary: string;
    neutral: string;
    background: string;
    foreground: string;
  };
  typography: {
    /** Heading/body font families (or a single family). */
    fontFamily: string;
    /** Base size + scale note. */
    scale: string;
  };
  spacing: {
    /** Base spacing unit. */
    base: string;
    /** Corner radius convention. */
    radius: string;
  };
}

export const DEFAULT_STACKS: Record<AppType, StackChoices> = {
  web: {
    backend: { value: "Node.js + Express", rationale: "Ubiquitous, well-documented, large hiring pool." },
    frontend: { value: "React + Vite", rationale: "Component model + fast dev server; the most common SPA stack." },
    database: { value: "PostgreSQL", rationale: "Reliable relational default with strong tooling." },
    styling: { value: "Tailwind CSS + shadcn/ui", rationale: "Utility-first speed with accessible, ownable components." },
    testing: { value: "Vitest + Playwright", rationale: "Fast unit tests plus real-browser E2E coverage." },
    hosting: { value: "Containerized (AWS / Vercel)", rationale: "Portable deploy target; swap providers without code change." },
  },
  desktop: {
    backend: { value: "Rust (Tauri core) or Node sidecar", rationale: "Tauri ships a tiny native binary; Node sidecar only if needed." },
    frontend: { value: "React (Tauri webview)", rationale: "Reuse web UI skills inside a lightweight native shell." },
    database: { value: "SQLite (embedded)", rationale: "Zero-config local persistence that ships with the app." },
    styling: { value: "Tailwind CSS", rationale: "Same styling model as web; no component-library lock-in required." },
    testing: { value: "Vitest", rationale: "Unit-tests the webview logic; native shell tested manually in v1." },
    hosting: { value: "Signed installers (per-OS)", rationale: "Distribute via native installers / auto-update, not a server." },
  },
  mobile: {
    backend: { value: "Node.js + Express API", rationale: "Shared API backend the mobile client calls over HTTPS." },
    frontend: { value: "React Native (Expo)", rationale: "One codebase for iOS + Android; reuses React skills." },
    database: { value: "SQLite (on-device) + Postgres (server)", rationale: "Local-first storage syncing to a server DB." },
    styling: { value: "NativeWind (Tailwind for RN)", rationale: "Tailwind syntax mapped to React Native styles." },
    testing: { value: "Jest + Detox", rationale: "Unit tests plus on-device end-to-end flows." },
    hosting: { value: "App stores + EAS / managed API", rationale: "Ship the app via stores; host the API as a managed service." },
  },
};

// [SCOPE 055 / T008] BEGIN — curated per-dimension option lists (checkbox pickers)
// Common, well-known choices per app type so the user can pick from a drop list
// instead of free-typing. Multi-select: several may be combined (e.g. "Vitest +
// Playwright"). The default value for each dimension is always included. Custom
// values typed directly are still allowed and preserved.
export const STACK_OPTIONS: Record<AppType, Record<StackDimension, string[]>> = {
  web: {
    backend: [
      "Node.js + Express",
      "Node.js + Fastify",
      "NestJS",
      "Python + FastAPI",
      "Python + Django",
      "Ruby on Rails",
      "Go + Gin",
      "Java + Spring Boot",
      "PHP + Laravel",
      "ASP.NET Core",
      "Frappe Framework (Python)",
    ],
    frontend: [
      "React + Vite",
      "Next.js",
      "Vue + Vite",
      "Nuxt",
      "SvelteKit",
      "Angular",
      "SolidJS",
      "Remix",
      "Astro",
      "Frappe UI (Vue 3)",
    ],
    database: [
      "PostgreSQL",
      "MySQL",
      "MariaDB",
      "SQLite",
      "MongoDB",
      "Microsoft SQL Server",
      "Redis",
      "Supabase (Postgres)",
    ],
    styling: [
      "Tailwind CSS + shadcn/ui",
      "Tailwind CSS",
      "Material UI (MUI)",
      "Chakra UI",
      "Bootstrap",
      "CSS Modules",
      "styled-components",
      "Ant Design",
    ],
    testing: [
      "Vitest",
      "Playwright",
      "Jest",
      "Cypress",
      "Testing Library",
      "Mocha + Chai",
    ],
    hosting: [
      "Containerized (AWS / Vercel)",
      "Vercel",
      "Netlify",
      "AWS (ECS/Fargate)",
      "AWS App Runner",
      "Google Cloud Run",
      "Azure App Service",
      "Fly.io",
      "Render",
      "Docker / Kubernetes",
      "Frappe Cloud",
    ],
  },
  desktop: {
    backend: [
      "Rust (Tauri core)",
      "Node sidecar",
      "Electron main process",
      ".NET",
      "C++ / Qt",
      "Go",
    ],
    frontend: [
      "React (Tauri webview)",
      "React (Electron)",
      "Vue",
      "Svelte",
      "Angular",
      "Native (Qt / WinUI)",
    ],
    database: [
      "SQLite (embedded)",
      "DuckDB",
      "RxDB",
      "LevelDB",
      "PostgreSQL (server)",
      "IndexedDB",
    ],
    styling: [
      "Tailwind CSS",
      "CSS Modules",
      "Material UI (MUI)",
      "Chakra UI",
      "styled-components",
    ],
    testing: ["Vitest", "Jest", "Playwright", "WebdriverIO"],
    hosting: [
      "Signed installers (per-OS)",
      "Auto-update (Tauri updater)",
      "Microsoft Store",
      "Mac App Store",
      "Snap / Flatpak",
    ],
  },
  mobile: {
    backend: [
      "Node.js + Express API",
      "NestJS",
      "Python + FastAPI",
      "Firebase",
      "Supabase",
      "Go",
      "Ruby on Rails API",
    ],
    frontend: [
      "React Native (Expo)",
      "React Native (CLI)",
      "Flutter",
      "Swift (iOS)",
      "Kotlin (Android)",
      "Ionic",
    ],
    database: [
      "SQLite (on-device) + Postgres (server)",
      "WatermelonDB",
      "Realm",
      "Firebase Firestore",
      "Supabase (Postgres)",
      "AsyncStorage",
    ],
    styling: [
      "NativeWind (Tailwind for RN)",
      "StyleSheet (RN)",
      "Tamagui",
      "React Native Paper",
      "styled-components",
    ],
    testing: ["Jest", "Detox", "Maestro", "Appium", "React Native Testing Library"],
    hosting: [
      "App stores + EAS / managed API",
      "EAS (Expo)",
      "Fastlane",
      "App Store + Play Store",
      "Firebase App Distribution",
    ],
  },
};

/** Split a stack value string ("A + B") into its parts. */
export function splitStackValue(value: string): string[] {
  return value
    .split(/\s*\+\s*|\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Join selected stack parts back into the canonical "A + B" form. */
export function joinStackValue(parts: string[]): string {
  return parts.join(" + ");
}
// [SCOPE 055 / T008] END

/** Neutral default design tokens used when no look-and-feel reference is cited. */
export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  colors: {
    primary: "#4f46e5", // indigo-600
    secondary: "#0ea5e9", // sky-500
    neutral: "#64748b", // slate-500
    background: "#ffffff",
    foreground: "#0f172a", // slate-900
  },
  typography: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    scale: "16px base, 1.25 modular scale",
  },
  spacing: {
    base: "4px (Tailwind spacing scale)",
    radius: "0.5rem (rounded-lg)",
  },
};

/** A fully-captured project stack + style. The markdown is the source of truth. */
export interface ProjectStackData {
  /** One or more application types this project ships (FR-002). At least one. */
  appTypes: AppType[];
  /** One captured stack per selected app type (keys are a subset of appTypes). */
  stacks: Partial<Record<AppType, StackChoices>>;
  /** Chosen gallery key and/or a cited named/URL reference (null = default style). */
  lookFeelReference: { galleryKey: string | null; cited: string | null } | null;
  tokens: DesignTokens;
}

/** Render the canonical `stack.md` markdown — the ProjectStack document body.
 *  Multiple application types render one Target Stack table each (FR-002); the
 *  Look & Feel / Design Tokens are shared across all of them. */
export function renderStackMarkdown(data: ProjectStackData): string {
  const appTypes = data.appTypes.length ? data.appTypes : (["web"] as AppType[]);
  const lines: string[] = [];
  lines.push(`# Project Stack & Style`);
  lines.push("");
  lines.push(`**Application types:** ${appTypes.map((t) => APP_TYPE_LABELS[t]).join(", ")}`);
  lines.push("");
  for (const appType of appTypes) {
    const stack = data.stacks[appType] ?? DEFAULT_STACKS[appType];
    lines.push(`## Target Stack — ${APP_TYPE_LABELS[appType]}`);
    lines.push("");
    lines.push(`| Dimension | Choice | Why |`);
    lines.push(`|---|---|---|`);
    for (const dim of STACK_DIMENSIONS) {
      const c = stack[dim];
      lines.push(`| ${STACK_DIMENSION_LABELS[dim]} | ${c.value} | ${c.rationale} |`);
    }
    lines.push("");
  }
  lines.push(`## Look & Feel`);
  lines.push("");
  if (data.lookFeelReference && (data.lookFeelReference.galleryKey || data.lookFeelReference.cited)) {
    const ref = data.lookFeelReference;
    if (ref.galleryKey) lines.push(`- **Gallery:** ${ref.galleryKey}`);
    if (ref.cited) lines.push(`- **Reference:** ${ref.cited}`);
  } else {
    lines.push(`- Default style (no reference cited).`);
  }
  lines.push("");
  lines.push(`### Design Tokens`);
  lines.push("");
  const t = data.tokens;
  lines.push(`- **Colors** — primary ${t.colors.primary}, secondary ${t.colors.secondary}, neutral ${t.colors.neutral}, background ${t.colors.background}, foreground ${t.colors.foreground}`);
  lines.push(`- **Typography** — ${t.typography.fontFamily}; ${t.typography.scale}`);
  lines.push(`- **Spacing** — base ${t.spacing.base}; radius ${t.spacing.radius}`);
  lines.push("");
  return lines.join("\n");
}

// [SCOPE 057 / T002] BEGIN — parse the application type(s) back out of a rendered stack.md
// The body carries `**Application types:** Web, Mobile` (multi) — and, for legacy
// single-type docs, `**Application type:** Web`. parseAppTypesFromStackMarkdown returns
// every recognized type in document order; parseAppTypeFromStackMarkdown returns the
// first (the promote-to-company-wide flow keys the profile by a single apptype, so it
// promotes the primary type). Both return empty/null when the marker is absent.
export function parseAppTypesFromStackMarkdown(markdown: string): AppType[] {
  const match = markdown.match(/\*\*Application types?:\*\*\s*([^\n]+)/i);
  if (!match) return [];
  const out: AppType[] = [];
  for (const raw of match[1].split(",")) {
    const label = raw.trim().toLowerCase();
    if ((APP_TYPES as readonly string[]).includes(label) && !out.includes(label as AppType)) {
      out.push(label as AppType);
    }
  }
  return out;
}

export function parseAppTypeFromStackMarkdown(markdown: string): AppType | null {
  return parseAppTypesFromStackMarkdown(markdown)[0] ?? null;
}
// [SCOPE 057 / T002] END

/** Build the default ProjectStackData for the given app type(s) (accept-all-defaults). */
export function defaultStackData(appTypes: AppType[] = ["web"]): ProjectStackData {
  const types = appTypes.length ? appTypes : (["web"] as AppType[]);
  const stacks: Partial<Record<AppType, StackChoices>> = {};
  for (const t of types) stacks[t] = structuredCloneStack(DEFAULT_STACKS[t]);
  return {
    appTypes: [...types],
    stacks,
    lookFeelReference: null,
    tokens: { ...DEFAULT_DESIGN_TOKENS },
  };
}

function structuredCloneStack(s: StackChoices): StackChoices {
  return STACK_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = { value: s[dim].value, rationale: s[dim].rationale };
    return acc;
  }, {} as StackChoices);
}

// [SCOPE 055 / T008] BEGIN — parseStackMarkdown (inverse of renderStackMarkdown)
// Round-trips a rendered ProjectStack document back into structured ProjectStackData
// so the web Stack tab can edit it with the same structured controls used at project
// creation. Best-effort: any field that can't be parsed falls back to the app-type
// default, so a hand-edited or partial doc still yields a valid editable object.
export function parseStackMarkdown(markdown: string): ProjectStackData {
  const appTypes = parseAppTypesFromStackMarkdown(markdown);
  const data = defaultStackData(appTypes.length ? appTypes : ["web"]);

  // Map dimension labels and app-type labels back to their keys.
  const labelToDim = new Map<string, StackDimension>();
  for (const dim of STACK_DIMENSIONS) {
    labelToDim.set(STACK_DIMENSION_LABELS[dim].toLowerCase(), dim);
  }
  const labelToType = new Map<string, AppType>();
  for (const t of APP_TYPES) labelToType.set(APP_TYPE_LABELS[t].toLowerCase(), t);

  // Walk the body; "## Target Stack — <Label>" headings switch which app type the
  // following table rows belong to. Legacy single-table docs (no label) apply to the
  // sole app type. Table rows: | <Dimension label> | <value> | <rationale> |
  let currentType: AppType = data.appTypes[0];
  for (const line of markdown.split(/\r?\n/)) {
    const head = line.match(/^##\s+Target Stack(?:\s*[—-]\s*(.+?))?\s*$/i);
    if (head) {
      const label = head[1]?.trim().toLowerCase();
      if (label && labelToType.has(label)) currentType = labelToType.get(label)!;
      continue;
    }
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!m) continue;
    const dim = labelToDim.get(m[1].trim().toLowerCase());
    if (!dim) continue;
    const value = m[2].trim();
    if (value && value !== "---") {
      if (!data.stacks[currentType]) {
        data.stacks[currentType] = structuredCloneStack(DEFAULT_STACKS[currentType]);
      }
      data.stacks[currentType]![dim] = { value, rationale: m[3].trim() };
    }
  }

  // Look & feel
  const galleryM = markdown.match(/\*\*Gallery:\*\*\s*(.+)/);
  const refM = markdown.match(/\*\*Reference:\*\*\s*(.+)/);
  const galleryKey = galleryM ? galleryM[1].trim() : null;
  const cited = refM ? refM[1].trim() : null;
  data.lookFeelReference = galleryKey || cited ? { galleryKey, cited } : null;

  // Design tokens (best-effort; keep defaults for anything unparseable)
  const colorsM = markdown.match(
    /\*\*Colors\*\*\s*[—-]\s*primary\s*([^,]+),\s*secondary\s*([^,]+),\s*neutral\s*([^,]+),\s*background\s*([^,]+),\s*foreground\s*([^\n]+)/i,
  );
  if (colorsM) {
    data.tokens.colors = {
      primary: colorsM[1].trim(),
      secondary: colorsM[2].trim(),
      neutral: colorsM[3].trim(),
      background: colorsM[4].trim(),
      foreground: colorsM[5].trim(),
    };
  }
  const typoM = markdown.match(/\*\*Typography\*\*\s*[—-]\s*([^;]+);\s*([^\n]+)/i);
  if (typoM) {
    data.tokens.typography = { fontFamily: typoM[1].trim(), scale: typoM[2].trim() };
  }
  const spaceM = markdown.match(/\*\*Spacing\*\*\s*[—-]\s*base\s*([^;]+);\s*radius\s*([^\n]+)/i);
  if (spaceM) {
    data.tokens.spacing = { base: spaceM[1].trim(), radius: spaceM[2].trim() };
  }

  return data;
}
// [SCOPE 055 / T008] END
